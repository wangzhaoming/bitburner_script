/** @param {NS} ns **/
export async function main(ns) {
    while (true) {
        var servers = scanAndHack(ns);

        for (let server of servers) {
            await ns.scp("hack.js", "home", server)
            await ns.scp("weaken.js", "home", server)
            await ns.scp("grow.js", "home", server)
            // await ns.installBackdoor(server)
        }
        ns.tprint(`servers:${[...servers.values()]}`)
        var freeRams = getFreeRam(ns, servers);
        // ns.tprint(`freeRams:${freeRams.map(value => JSON.stringify(value))}`)
        var hackables = getHackable(ns, servers);
        // ns.tprint(`hackable:${[...hackables.values()]}`)
        var hackstates = getHackStates(ns, servers, hackables)
        ns.tprint(`hackstates:${[...hackstates.entries()].map((v, _i) => `${v[0]}:{${JSON.stringify(v[1])}}\n`)}`)
        manageAndHack(ns, freeRams, hackables, hackstates)
        await ns.sleep(10000)
    }
}

function manageAndHack(ns, freeRams, hackables, hackstates) {
    for (let target of hackables) {
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);
        const minSec = ns.getServerMinSecurityLevel(target);
        const sec = ns.getServerSecurityLevel(target);

        var secDiff = sec - minSec
        if (secDiff > 0) {
            var threads = Math.floor(secDiff * 20) - hackstates.get(target).weaken;
            if (threads > 0) {
                if (!findPlaceToRun(ns, "weaken.js", threads, freeRams, target)) {
                    continue;
                }
            }

        }

        var moneyPercent = money / maxMoney * 100
        if (moneyPercent < 90) {
            var threads = Math.floor(ns.growthAnalyze(target, 100 / moneyPercent))
                - hackstates.get(target).grow;
            if (threads > 0) {
                if (!findPlaceToRun(ns, "grow.js", threads, freeRams, target)) {
                    continue;
                }
            }
        }

        if (moneyPercent > 75 && secDiff < 50) {
            var threads = Math.floor(ns.hackAnalyzeThreads(target, money - (0.4 * maxMoney)))
                - hackstates.get(target).hack
            if (threads > 0) {
                // hack to money percent = 70
                if (!findPlaceToRun(ns, "hack.js", threads, freeRams, target)) {
                    continue;
                }
            }
        }
        // ns.tprint(`target:${target} secDiff:${secDiff.toFixed(2)} moneyPercent:${moneyPercent.toFixed(2)}`)
    }
    // for hacking exp
    // findPlaceToRun(ns, "grow.js", 20000000000, freeRams, hackables[0])
}
function findPlaceToRun(ns, script, threads, freeRams, target) {
    let scriptRam = ns.getScriptRam(script)
    var remaingThread = threads;
    while (true) {
        if (freeRams.length === 0) {
            return false;
        }
        var host = freeRams[0].host;
        var ram = freeRams[0].freeRam;

        if (ram < scriptRam) {
            freeRams.shift()
        } else if (ram < scriptRam * remaingThread) {
            const threadForThisHost = Math.floor(ram / scriptRam)
            // ns.tprint(`executing ${script} on ${host} with ${threadForThisHost} threads, targeting ${target}`)

            if (ns.exec(script, host, threadForThisHost, target) === 0) {
                ns.kill(script, host, target)
                ns.exec(script, host, threadForThisHost, target)
            }
            remaingThread -= threadForThisHost
            freeRams.shift()
        } else {
            // ns.tprint(`executing ${script} on ${host} with ${remaingThread} threads, targeting ${target}`)
            if (ns.exec(script, host, remaingThread, target) === 0) {
                ns.kill(script, host, target)
                ns.exec(script, host, remaingThread, target)
            }
            freeRams[0].freeRam -= scriptRam * remaingThread

            return true;
        }
    }

}
function getHackStates(ns, servers, hackables) {
    var hackstates = new Map();
    for (let server of servers.values()) {
        for (let hackable of hackables.values()) {
            let weakenScript = ns.getRunningScript("weaken.js", server, hackable);
            let growScript = ns.getRunningScript("grow.js", server, hackable);
            let hackScript = ns.getRunningScript("hack.js", server, hackable);
            if (hackstates.has(hackable)) {
                hackstates.get(hackable).weaken += weakenScript === null ? 0 : weakenScript.threads
                hackstates.get(hackable).grow += growScript === null ? 0 : growScript.threads
                hackstates.get(hackable).hack += hackScript === null ? 0 : hackScript.threads
            } else {
                hackstates.set(hackable, {
                    weaken: weakenScript === null ? 0 : weakenScript.threads,
                    grow: growScript === null ? 0 : growScript.threads,
                    hack: hackScript === null ? 0 : hackScript.threads
                })
            }
        }
    }
    return hackstates
}
function getHackable(ns, servers) {
    return [...servers.values()].filter(server => ns.getServerMaxMoney(server) > 100000
        && ns.getServerMoneyAvailable(server) > 1000
        && ns.getServerGrowth(server)
        && ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel())
        .sort((a, b) => ns.getServerRequiredHackingLevel(a) - ns.getServerRequiredHackingLevel(b))
}

function getFreeRam(ns, servers) {
    const freeRams = [];
    for (let server of servers) {
        const freeRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
        if (freeRam > 1) {
            freeRams.push({ host: server, freeRam: freeRam });
        }

    }
    var sortedFreeRams = freeRams.sort((a, b) => b.freeRam - a.freeRam);
    return sortedFreeRams;
}

function scanAndHack(ns) {
    let servers = new Set(["home"]);
    scanAll("home", servers, ns);
    const accesibleServers = new Set();
    for (let server of servers) {
        if (ns.hasRootAccess(server)) {
            accesibleServers.add(server);
            continue;
        }
        
        var portOpened = 0;
        if (ns.fileExists("BruteSSH.exe")) {
            ns.brutessh(server);
            portOpened++;
        }
        if (ns.fileExists("FTPCrack.exe")) {
            ns.ftpcrack(server);
            portOpened++;
        }

        if (ns.fileExists("HTTPWorm.exe")) {
            ns.httpworm(server);
            portOpened++;
        }
        if (ns.fileExists("relaySMTP.exe")) {
            ns.relaysmtp(server);
            portOpened++;
        }

        if (ns.fileExists("SQLInject.exe")) {
            ns.sqlinject(server);
            portOpened++;
        }
        
        if (ns.getServerNumPortsRequired(server) <= portOpened) {
            ns.nuke(server);
            accesibleServers.add(server);
        }
    }
    return accesibleServers.add("home");
}

function scanAll(host, servers, ns) {
    var hosts = ns.scan(host);
    ns.print(hosts);
    for (let i = 0; i < hosts.length; i++) {
        if (!servers.has(hosts[i])) {
            servers.add(hosts[i]);
            scanAll(hosts[i], servers, ns);
        }

    }
}
