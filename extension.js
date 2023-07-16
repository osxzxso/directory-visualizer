const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const excludedEntries = [];

async function generateTreeMap(dir, prefix, includedDirs, colors = {}) {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    let output = '';

    const filteredEntries = entries.filter(([file, _]) => {
        const fileType = path.extname(file);
        return !excludedEntries.includes(file) && !excludedEntries.includes(fileType);
    });
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
            if (includedDirs.includes(filePath)) {
                output += `<span style="color:white">${linePrefix}<span style="color:white">${file}</span></span>\n`;
                output += await generateTreeMap(filePath, childPrefix, includedDirs, colors);
            }
        } else {
            const color = getColorByFileType(file, colors);
            output += `<span style="color:white">${linePrefix}<span style="color:${color}">${file}</span></span>\n`;
        }
    }

    return output;
}

async function generateCheckboxTree(dir, prefix, includedDirs = []) {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    let output = '';

    const filteredEntries = entries.filter(([file, _]) => {
        const fileType = path.extname(file);
        return !excludedEntries.includes(file) && !excludedEntries.includes(fileType);
    });
    const directories = filteredEntries.filter(([_, type]) => type === vscode.FileType.Directory).sort(([a, _], [b, __]) => a.toLowerCase().localeCompare(b.toLowerCase()));

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
            panel.webview.html = generateHtml(output, checkboxTree, excludedEntries);

            panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'regenerate':
                            let output = rootName + '\n';
                            output += await generateTreeMap(rootPath, '', message.includedDirs, message.colors);
                            const checkboxTree = rootName + '\n' + await generateCheckboxTree(rootPath, '', message.includedDirs);
                            panel.webview.html = generateHtml(output, checkboxTree, excludedEntries);
                            break;
                        case 'copy':
                            vscode.window.showInformationMessage('Copied to clipboard');
                            break;
                        case 'export':
                            const filePath = path.join(vscode.workspace.rootPath, 'directory-visualizer-data.txt');
                            await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(message.data, 'utf8'));
                            vscode.window.showInformationMessage('Exported to directory-visualizer-data.txt');
                            break;
                        case 'addExclusion':
                            excludedEntries.push(message.entry);
                            break;
                        case 'removeExclusion':
                            const index = excludedEntries.indexOf(message.entry);
                            if (index !== -1) {
                                excludedEntries.splice(index, 1);
                            }
                            break;
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

function generateHtml(output, checkboxTree, excludedEntries) {
    return `
        <body style="background-color: #24292E; color: #FFFFFF;">
            <style>
                a, input[type="checkbox"], button, input[type="color"] {
                    cursor: pointer;
                }
                label {
                    cursor: text;
                }
                .nav-link:hover {
                    cursor: pointer;
                }
                .chip {
                    display: inline-block;
                    padding: 0 25px;
                    height: 50px;
                    font-size: 16px;
                    line-height: 50px;
                    // border-radius: 25px;
                    background-color: #202428;
                    margin: 10px 5px;
                }
                .chip span {
                    cursor: pointer;
                    display: inline-block;
                    padding: 0 10px;
                    // border-radius: 50%;
                    background-color: #FFFFFF;
                    color: #202428;
                    line-height: 30px;
                    height: 30px;
                    width: 30px;
                    text-align: center;
                    margin-left: 10px;
                }
            </style>
            <nav>
                <ul style="list-style-type: none; margin: 0; padding: 0; overflow: hidden; background-color: #202428;">
                    <li style="float: left;"><a class="nav-link" id="toggleCheckboxTree" style="display: block; color: white; text-align: center; padding: 14px 16px; text-decoration: none;">Select Directories</a></li>
                    <li style="float: left;"><a class="nav-link" id="toggleColorPicker" style="display: block; color: white; text-align: center; padding: 14px 16px; text-decoration: none;">Select Colors</a></li>
                    <li style="float: left;"><a class="nav-link" id="toggleExclusions" style="display: block; color: white; text-align: center; padding: 14px 16px; text-decoration: none;">Select Exclusions</a></li>
                </ul>
            </nav>
            <div id="checkboxTree" style="display: none;">
                <pre>${checkboxTree}</pre>
                <button id="regenerate">Regenerate</button>
                <button id="selectAll">Select All</button>
                <button id="unselectAll">Unselect All</button>
            </div>
            <div id="colorPicker" style="display: none;">
                <br>
                <div style="display: flex; flex-wrap: wrap; justify-content: space-between;">
                    <div style="flex: 1 0 21%; margin: 1%; display: flex; align-items: center;">
                        <input type="color" id="mediaColor" name="mediaColor" value="#C679DC">
                        <label style="margin-left: 10px;">Media files:</label>
                    </div>
                    <div style="flex: 1 0 21%; margin: 1%; display: flex; align-items: center;">
                        <input type="color" id="codeColor" name="codeColor" value="#5CA3DD">
                        <label style="margin-left: 10px;">Code files:</label>
                    </div>
                    <div style="flex: 1 0 21%; margin: 1%; display: flex; align-items: center;">
                        <input type="color" id="markupColor" name="markupColor" value="#F9D77E">
                        <label style="margin-left: 10px;">Markup/Stylesheet files:</label>
                    </div>
                    <div style="flex: 1 0 21%; margin: 1%; display: flex; align-items: center;">
                        <input type="color" id="dataColor" name="dataColor" value="#98C479">
                        <label style="margin-left: 10px;">Data files:</label>
                    </div>
                    <div style="flex: 1 0 21%; margin: 1%; display: flex; align-items: center;">
                        <input type="color" id="documentColor" name="documentColor" value="#7EF9DF">
                        <label style="margin-left: 10px;">Document files:</label>
                    </div>
                    <div style="flex: 1 0 21%; margin: 1%; display: flex; align-items: center;">
                        <input type="color" id="configColor" name="configColor" value="#F97E7E">
                        <label style="margin-left: 10px;">Configuration files:</label>
                    </div>
                    <div style="flex: 1 0 21%; margin: 1%; display: flex; align-items: center;">
                        <input type="color" id="scriptColor" name="scriptColor" value="#FFA756">
                        <label style="margin-left: 10px;">Script files:</label>
                    </div>
                    <div style="flex: 1 0 21%; margin: 1%; display: flex; align-items: center;">
                        <input type="color" id="otherColor" name="otherColor" value="#ABB2BF">
                        <label style="margin-left: 10px;">Other files:</label>
                    </div>
                </div>
                <br>
                <button id="saveRegenerate">Save/Regenerate</button>
                <button id="resetRegenerate">Reset/Regenerate</button>
            </div>
            <div id="exclusions" style="display: none;">
                <br>
                <label for="newExclusion">Enter a directory, file, or file type:</label>
                <br><br>
                <input type="text" id="newExclusion">
                <button id="addExclusion">+</button>
                ${excludedEntries.length > 0 ? '<br><br>' : ''}
                <div id="exclusionChips">
                    ${excludedEntries.map(entry => `<div class="chip">${entry}<span class="closebtn" data-entry="${entry}">&times;</span></div>`).join('')}
                </div>
            </div>
            <br>
            <hr>
            <br>
            <button id="copy">Copy</button>
            <button id="export">Export</button>
            <div id="output"><pre>${output}</pre></div>
            <script>
                const vscode = acquireVsCodeApi();
                const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                const selectAllButton = document.getElementById('selectAll');
                const unselectAllButton = document.getElementById('unselectAll');
                const checkboxTree = document.getElementById('checkboxTree');
                const colorPicker = document.getElementById('colorPicker');
                const exclusions = document.getElementById('exclusions');
                let checkboxTreeVisible = false;
                let colorPickerVisible = false;
                let exclusionsVisible = false;
                function updateButtons() {
                    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                    const allUnchecked = Array.from(checkboxes).every(cb => !cb.checked);
                    selectAllButton.style.display = allChecked ? 'none' : 'inline';
                    unselectAllButton.style.display = allUnchecked ? 'none' : 'inline';
                }
                updateButtons();
                checkboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', function() {
                        const value = this.value;
                        const isChecked = this.checked;
                        // Check/uncheck parents
                        if (isChecked) {
                            let parentValue = value;
                            while (Math.max(parentValue.lastIndexOf('/'), parentValue.lastIndexOf('\\\\')) > 0) {
                                parentValue = parentValue.substring(0, Math.max(parentValue.lastIndexOf('/'), parentValue.lastIndexOf('\\\\')));
                                const parentCheckbox = Array.from(checkboxes).find(cb => cb.value === parentValue);
                                if (parentCheckbox) {
                                    parentCheckbox.checked = true;
                                }
                            }
                        } else {
                            // Uncheck children
                            checkboxes.forEach(cb => {
                                if (cb.value.startsWith(value)) {
                                    cb.checked = false;
                                }
                            });
                        }
                        updateButtons();
                    });
                });
                selectAllButton.addEventListener('click', () => {
                    checkboxes.forEach(cb => cb.checked = true);
                    updateButtons();
                });

                unselectAllButton.addEventListener('click', () => {
                    checkboxes.forEach(cb => cb.checked = false);
                    updateButtons();
                });
                document.getElementById('copy').addEventListener('click', () => {
                    const outputText = document.getElementById('output').innerText.trim();
                    navigator.clipboard.writeText(outputText);
                    vscode.postMessage({
                        command: 'copy'
                    });
                });
                document.getElementById('export').addEventListener('click', () => {
                    const outputText = document.getElementById('output').innerText.trim();
                    vscode.postMessage({
                        command: 'export',
                        data: outputText
                    });
                });
                document.getElementById('regenerate').addEventListener('click', () => {
                    const includedDirs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
                    const colors = {
                        mediaColor: document.getElementById('mediaColor').value,
                        codeColor: document.getElementById('codeColor').value,
                        markupColor: document.getElementById('markupColor').value,
                        dataColor: document.getElementById('dataColor').value,
                        documentColor: document.getElementById('documentColor').value,
                        configColor: document.getElementById('configColor').value,
                        scriptColor: document.getElementById('scriptColor').value,
                        otherColor: document.getElementById('otherColor').value
                    };
                    vscode.postMessage({
                        command: 'regenerate',
                        includedDirs: includedDirs,
                        colors: colors
                    });
                });
                document.getElementById('saveRegenerate').addEventListener('click', () => {
                    const includedDirs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
                    const colors = {
                        mediaColor: document.getElementById('mediaColor').value,
                        codeColor: document.getElementById('codeColor').value,
                        markupColor: document.getElementById('markupColor').value,
                        dataColor: document.getElementById('dataColor').value,
                        documentColor: document.getElementById('documentColor').value,
                        configColor: document.getElementById('configColor').value,
                        scriptColor: document.getElementById('scriptColor').value,
                        otherColor: document.getElementById('otherColor').value
                    };
                    vscode.postMessage({
                        command: 'regenerate',
                        includedDirs: includedDirs,
                        colors: colors
                    });
                });
                document.getElementById('resetRegenerate').addEventListener('click', () => {
                    const includedDirs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
                    const colors = {
                        mediaColor: '#C679DC',
                        codeColor: '#5CA3DD',
                        markupColor: '#F9D77E',
                        dataColor: '#98C479',
                        documentColor: '#7EF9DF',
                        configColor: '#F97E7E',
                        scriptColor: '#FFA756',
                        otherColor: '#ABB2BF'
                    };
                    vscode.postMessage({
                        command: 'regenerate',
                        includedDirs: includedDirs,
                        colors: colors
                    });
                });
                function regenerateTreeMap() {
                    const includedDirs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
                    const colors = {
                        mediaColor: document.getElementById('mediaColor').value,
                        codeColor: document.getElementById('codeColor').value,
                        markupColor: document.getElementById('markupColor').value,
                        dataColor: document.getElementById('dataColor').value,
                        documentColor: document.getElementById('documentColor').value,
                        configColor: document.getElementById('configColor').value,
                        scriptColor: document.getElementById('scriptColor').value,
                        otherColor: document.getElementById('otherColor').value
                    };
                    vscode.postMessage({
                        command: 'regenerate',
                        includedDirs: includedDirs,
                        colors: colors
                    });
                }
                document.getElementById('addExclusion').addEventListener('click', () => {
                    const newExclusion = document.getElementById('newExclusion').value;
                    if (newExclusion) {
                        vscode.postMessage({
                            command: 'addExclusion',
                            entry: newExclusion
                        });
                        regenerateTreeMap();
                    }
                });
                document.querySelectorAll('.closebtn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const entry = btn.getAttribute('data-entry');
                        vscode.postMessage({
                            command: 'removeExclusion',
                            entry: entry
                        });
                        regenerateTreeMap();
                    });
                });
                document.getElementById('toggleCheckboxTree').addEventListener('click', () => {
                    checkboxTreeVisible = !checkboxTreeVisible;
                    checkboxTree.style.display = checkboxTreeVisible ? 'block' : 'none';
                    if (checkboxTreeVisible) {
                        colorPicker.style.display = 'none';
                        colorPickerVisible = false;
                        exclusions.style.display = 'none';
                        exclusionsVisible = false;
                    }
                });
                document.getElementById('toggleColorPicker').addEventListener('click', () => {
                    colorPickerVisible = !colorPickerVisible;
                    colorPicker.style.display = colorPickerVisible ? 'block' : 'none';
                    if (colorPickerVisible) {
                        checkboxTree.style.display = 'none';
                        checkboxTreeVisible = false;
                        exclusions.style.display = 'none';
                        exclusionsVisible = false;
                    }
                });
                document.getElementById('toggleExclusions').addEventListener('click', () => {
                    exclusionsVisible = !exclusionsVisible;
                    exclusions.style.display = exclusionsVisible ? 'block' : 'none';
                    if (exclusionsVisible) {
                        checkboxTree.style.display = 'none';
                        checkboxTreeVisible = false;
                        colorPicker.style.display = 'none';
                        colorPickerVisible = false;
                    }
                });
            </script>
        </body>
    `;
}

function getColorByFileType(file, colors = {}) {
    const ext = path.extname(file);
    const base = path.basename(file);

    const defaultColors = {
        mediaColor: '#C679DC',
        codeColor: '#5CA3DD',
        markupColor: '#F9D77E',
        dataColor: '#98C479',
        documentColor: '#7EF9DF',
        configColor: '#F97E7E',
        scriptColor: '#FFA756',
        otherColor: '#ABB2BF'
    };

    colors = {...defaultColors, ...colors};

    if (base === 'LICENSE' || base === 'license') {
        return colors.documentColor; // Document files
    }

    switch (ext) {
        case '.jpg':
        case '.png':
        case '.gif':
        case '.svg':
        case '.mp4':
        case '.mp3':
            return colors.mediaColor; // Media files
        case '.js':
        case '.ts':
        case '.py':
        case '.java':
        case '.c':
        case '.cpp':
        case '.cs':
        case '.rb':
        case '.go':
            return colors.codeColor; // Code files
        case '.html':
        case '.css':
        case '.scss':
        case '.less':
        case '.xml':
            return colors.markupColor; // Markup/Stylesheet files
        case '.json':
        case '.csv':
        case '.sql':
        case '.db':
            return colors.dataColor; // Data files
        case '.docx':
        case '.xlsx':
        case '.pptx':
        case '.pdf':
        case '.txt':
        case '.md':
            return colors.documentColor; // Document files
        case '.yml':
        case '.yaml':
        case '.ini':
        case '.env':
        case '.config':
            return colors.configColor; // Configuration files
        case '.sh':
        case '.bat':
        case '.ps1':
            return colors.scriptColor; // Script files
        default:
            return colors.otherColor; // Other files
    }
}

exports.activate = activate;

function deactivate() { }

module.exports = {
    activate,
    deactivate
};