const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

async function generateTreeMap(dir, prefix, includedDirs) {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    let output = '';

    const filteredEntries = entries.filter(([file, _]) => file !== '.git' && file !== '.DS_Store');
    const directories = filteredEntries.filter(([_, type]) => type === vscode.FileType.Directory).sort(([a, _], [b, __]) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const files = filteredEntries.filter(([_, type]) => type === vscode.FileType.File).sort(([a, _], [b, __]) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const sortedEntries = [...directories, ...files];

    for (let i = 0; i < sortedEntries.length; i++) {
        const [file, type] = sortedEntries[i];
        const filePath = path.join(dir, file);
        const isLast = i === sortedEntries.length - 1;
        const linePrefix = prefix + (isLast ? ' ┗ ' : ' ┣ ');
        const childPrefix = prefix + (isLast ? '   ' : ' ┃ ');

        if (type === vscode.FileType.Directory) {
            if (includedDirs.length === 0 || includedDirs.includes(filePath)) {
                output += `<span style="color:white">${linePrefix}<span style="color:white">${file}</span></span>\n`;
                output += await generateTreeMap(filePath, childPrefix, includedDirs);
            }
        } else {
            const color = getColorByFileType(file);
            output += `<span style="color:white">${linePrefix}<span style="color:${color}">${file}</span></span>\n`;
        }
    }

    return output;
}

async function generateCheckboxTree(dir, prefix, includedDirs = []) {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    let output = '';

    const directories = entries.filter(([_, type]) => type === vscode.FileType.Directory).sort(([a, _], [b, __]) => a.toLowerCase().localeCompare(b.toLowerCase()));

    for (let i = 0; i < directories.length; i++) {
        const [file, _] = directories[i];
        const filePath = path.join(dir, file);
        const isLast = i === directories.length - 1;
        const linePrefix = prefix + (isLast ? ' ┗ ' : ' ┣ ');
        const childPrefix = prefix + (isLast ? '   ' : ' ┃ ');

        output += `<span style="color:white">${linePrefix}<input type="checkbox" ${includedDirs.includes(filePath) ? 'checked' : ''} value="${filePath}">${file}</span>\n`;
        output += await generateCheckboxTree(filePath, childPrefix, includedDirs);
    }

    return output;
}

async function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.generateTreeMap', async function () {
        const rootPath = vscode.workspace.rootPath;
        if (rootPath) {
            const rootName = path.basename(rootPath).toUpperCase();
            let output = rootName + '\n';
            const allDirs = await getAllDirectories(rootPath);
            output += await generateTreeMap(rootPath, '', allDirs);

            const panel = vscode.window.createWebviewPanel(
                'treeMapView',
                'Directory Visualizer',
                vscode.ViewColumn.One,
                {
                    enableScripts: true
                }
            );

            const checkboxTree = rootName + '\n' + await generateCheckboxTree(rootPath, '', allDirs);
            panel.webview.html = `
                <body style="background-color: #24292E; color: #FFFFFF;">
                    <pre>${checkboxTree}</pre>
                    <button id="regenerate">Regenerate</button>
                    <hr>
                    <pre>${output}</pre>
                    <script>
                        const vscode = acquireVsCodeApi();
                        document.getElementById('regenerate').addEventListener('click', () => {
                            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                            const includedDirs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
                            vscode.postMessage({
                                command: 'regenerate',
                                includedDirs: includedDirs
                            });
                        });
                    </script>
                </body>
            `;

            panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'regenerate':
                            let output = rootName + '\n';
                            output += await generateTreeMap(rootPath, '', message.includedDirs);
                            const checkboxTree = rootName + '\n' + await generateCheckboxTree(rootPath, '', message.includedDirs);
                            panel.webview.html = `
                                <body style="background-color: #24292E; color: #FFFFFF;">
                                    <pre>${checkboxTree}</pre>
                                    <button id="regenerate">Regenerate</button>
                                    <hr>
                                    <pre>${output}</pre>
                                    <script>
                                        const vscode = acquireVsCodeApi();
                                        document.getElementById('regenerate').addEventListener('click', () => {
                                            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                                            const includedDirs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
                                            vscode.postMessage({
                                                command: 'regenerate',
                                                includedDirs: includedDirs
                                            });
                                        });
                                    </script>
                                </body>
                            `;
                            return;
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    });

    context.subscriptions.push(disposable);
}

async function getAllDirectories(dir) {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    const directories = entries.filter(([_, type]) => type === vscode.FileType.Directory).map(([file, _]) => path.join(dir, file));
    const subdirectories = await Promise.all(directories.map(getAllDirectories));
    return directories.concat(...subdirectories);
}

function getColorByFileType(file) {
    const ext = path.extname(file);
    const base = path.basename(file);

    if (base === 'LICENSE' || base === 'license') {
        return '#7EF9DF'; // Document files
    }

    switch (ext) {
        case '.jpg':
        case '.png':
        case '.gif':
        case '.svg':
        case '.mp4':
        case '.mp3':
            return '#C679DC'; // Media files
        case '.js':
        case '.ts':
        case '.py':
        case '.java':
        case '.c':
        case '.cpp':
        case '.cs':
        case '.rb':
        case '.go':
            return '#5CA3DD'; // Code files
        case '.html':
        case '.css':
        case '.scss':
        case '.less':
        case '.xml':
            return '#F9D77E'; // Markup/Stylesheet files
        case '.json':
        case '.csv':
        case '.sql':
        case '.db':
            return '#98C479'; // Data files
        case '.docx':
        case '.xlsx':
        case '.pptx':
        case '.pdf':
        case '.txt':
        case '.md':
            return '#7EF9DF'; // Document files
        case '.yml':
        case '.yaml':
        case '.ini':
        case '.env':
        case '.config':
            return '#F97E7E'; // Configuration files
        case '.sh':
        case '.bat':
        case '.ps1':
            return '#FFA756'; // Script files
        default:
            return '#ABB2BF'; // Other files
    }
}

exports.activate = activate;

function deactivate() { }

module.exports = {
    activate,
    deactivate
};