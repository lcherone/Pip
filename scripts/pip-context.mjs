#!/usr/bin/env node
// Run from an explicitly registered workspace. Reports metadata only; does not execute a task.
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
const [type = 'workspace', directory = process.cwd(), file] = process.argv.slice(2)
if (!['workspace', 'test_failed', 'build_failed', 'merge_conflict'].includes(type)) throw new Error('Supported events: workspace, test_failed, build_failed, merge_conflict')
const socketPath = process.env.PIP_ASSISTANT_SOCKET || path.join(os.homedir(), 'Library/Application Support/pip/assistant.sock')
const socket = net.createConnection(socketPath)
socket.setTimeout(3000, () => { console.error('Pip did not respond'); socket.destroy(); process.exitCode = 1 })
socket.on('connect', () => socket.write(JSON.stringify({ type, path: fs.realpathSync(directory), file }) + '\n'))
socket.on('data', chunk => { const message = String(chunk).trim(); console.log(message); if (message !== 'Accepted') process.exitCode = 1; socket.end() })
socket.on('error', () => { console.error('Enable local workspace integration in Pip settings, then register this folder.'); process.exitCode = 1 })
