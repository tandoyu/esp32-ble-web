let device;
let txCharacteristic;
let rxCharacteristic;
let codeIsSet = false;
let isAuthenticated = false;

async function connect() {
    try {
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('connectBtn').textContent = "Verbinde...";
        
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: "BlinkSave Pro" }],
            optionalServices: [0xFFE0]
        });
        
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(0xFFE0);
        
        txCharacteristic = await service.getCharacteristic(0xFFE2);
        rxCharacteristic = await service.getCharacteristic(0xFFE1);
        
        txCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
        await txCharacteristic.startNotifications();
        
        document.getElementById('connectionStatus').textContent = "Verbunden";
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'inline-block';
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('blinkerSection').style.display = 'block';
        document.getElementById('settingsSection').style.display = 'block';
        
        await sendCommand("GETSTATUS");
        
    } catch(error) {
        console.error('Fehler:', error);
        document.getElementById('connectionStatus').textContent = "Fehler: " + error.message;
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('connectBtn').textContent = "Erneut versuchen";
    }
}

async function disconnect() {
    try {
        if (device && device.gatt.connected) {
            if (txCharacteristic) {
                await txCharacteristic.stopNotifications();
            }
            await device.gatt.disconnect();
            
            device = null;
            txCharacteristic = null;
            rxCharacteristic = null;
            codeIsSet = false;
            isAuthenticated = false;
            
            document.getElementById('connectionStatus').textContent = "Getrennt";
            document.getElementById('connectBtn').style.display = 'inline-block';
            document.getElementById('disconnectBtn').style.display = 'none';
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('blinkerSection').style.display = 'none';
            document.getElementById('settingsSection').style.display = 'none';
            document.getElementById('connectBtn').disabled = false;
            document.getElementById('connectBtn').textContent = "Mit BlinkSave Pro verbinden";
            
            document.getElementById('blinkerStatus').textContent = "---";
            document.getElementById('blinkerIndicator').style.backgroundColor = 'var(--status-inactive)';
            document.getElementById('blinkerIndicator').style.boxShadow = '0 0 15px transparent';
        }
    } catch(error) {
        console.error('Fehler beim Trennen:', error);
        document.getElementById('connectionStatus').textContent = "Fehler beim Trennen: " + error.message;
    }
}

function handleNotifications(event) {
    const value = new TextDecoder().decode(event.target.value);
    console.log("Empfangen:", value);
    
    // Statusanzeige
    if (value.includes("BLINKER:1")) {
        document.getElementById('blinkerStatus').textContent = "AKTIV";
        document.getElementById('blinkerIndicator').style.backgroundColor = 'var(--status-active)';
        document.getElementById('blinkerIndicator').style.boxShadow = '0 0 15px var(--status-active)';
        document.getElementById('blinkerOnBtn').textContent = "Aktiv (läuft)";
    } else if (value.includes("BLINKER:0")) {
        document.getElementById('blinkerStatus').textContent = "INAKTIV";
        document.getElementById('blinkerIndicator').style.backgroundColor = 'var(--status-inactive)';
        document.getElementById('blinkerIndicator').style.boxShadow = '0 0 15px transparent';
        document.getElementById('blinkerOnBtn').textContent = "Aktivieren";
    }
    
    // Code Status
    if (value.includes("CODE:SET")) {
        codeIsSet = true;
        document.getElementById('codeState').textContent = "Sicherheitscode gesetzt";
    } else if (value.includes("CODE:NONE")) {
        codeIsSet = false;
        document.getElementById('codeState').textContent = "Kein Sicherheitscode";
    }
    
    // Authentifizierung
    if (value.includes("AUTH:1")) {
        isAuthenticated = true;
        updateUI();
    } else if (value.includes("AUTH:0")) {
        isAuthenticated = false;
        updateUI();
    }
    
    // Beep-Zeiten
    if (value.includes("DELAYS:")) {
        const times = value.split("DELAYS:")[1].split(",");
        const doubleBeep = times[0];
        const longBeep = times[1];
        
        document.getElementById('doubleBeepInput').value = doubleBeep;
        document.getElementById('longBeepInput').value = longBeep;
        
        let doubleBeepText = doubleBeep === "0" ? "deaktiviert" : `${doubleBeep}s`;
        let longBeepText = longBeep === "0" ? "deaktiviert" : `${longBeep}s`;
        
        document.getElementById('currentBeepTimes').textContent = 
            `Doppelbeep: ${doubleBeepText}, Dauerbeep: ${longBeepText}`;
    }
    
    // Nachrichten
    const authMsg = document.getElementById('authMessage');
    if (value === "AUTH_OK") {
        authMsg.textContent = "Erfolgreich authentifiziert!";
        authMsg.className = "success";
        authMsg.style.display = "block";
        setTimeout(() => authMsg.style.display = "none", 3000);
    } else if (value === "AUTH_FAIL") {
        authMsg.textContent = "Authentifizierung fehlgeschlagen - falscher Code!";
        authMsg.className = "error";
        authMsg.style.display = "block";
    } else if (value === "DELAYS_UPDATED") {
        const successMsg = document.getElementById('beepTimeSuccess');
        successMsg.textContent = "Beep-Zeiten erfolgreich aktualisiert!";
        successMsg.className = "success";
        successMsg.style.display = "block";
        setTimeout(() => successMsg.style.display = "none", 3000);
    } else if (value === "ERROR:INVALID_TIME") {
        const errorMsg = document.getElementById('beepTimeError');
        errorMsg.textContent = "Ungültige Zeitwerte (0-180s für Doppelbeep, 0-300s für Dauerbeep)!";
        errorMsg.className = "error";
        errorMsg.style.display = "block";
        setTimeout(() => errorMsg.style.display = "none", 3000);
    }
}

function updateUI() {
    const codeArea = document.getElementById('codeInputArea');
    codeArea.innerHTML = '';
    
    if (!isAuthenticated) {
        if (codeIsSet) {
            codeArea.innerHTML = `
                <p>Bitte geben Sie Ihren Sicherheitscode ein:</p>
                <input type="password" id="codeInput" placeholder="Sicherheitscode">
                <button id="authBtn">Authentifizieren</button>
            `;
            document.getElementById('authBtn').addEventListener('click', authenticate);
        } else {
            codeArea.innerHTML = `
                <p>Bitte legen Sie einen Sicherheitscode fest (4-16 Zeichen):</p>
                <input type="password" id="newCode" placeholder="Neuer Sicherheitscode">
                <button id="setCodeBtn">Code speichern</button>
            `;
            document.getElementById('setCodeBtn').addEventListener('click', setCode);
        }
        
        document.getElementById('blinkerOnBtn').disabled = true;
        document.getElementById('blinkerOffBtn').disabled = true;
    } else {
        codeArea.innerHTML = `
            <div class="button-group">
                <button id="logoutBtn">Abmelden</button>
                ${codeIsSet ? '<button id="changeCodeBtn">Code ändern</button>' : ''}
            </div>
        `;
        document.getElementById('logoutBtn').addEventListener('click', logout);
        if (codeIsSet) {
            document.getElementById('changeCodeBtn').addEventListener('click', showCodeChange);
        }
        
        document.getElementById('blinkerOnBtn').disabled = false;
        document.getElementById('blinkerOffBtn').disabled = false;
    }
}

async function sendCommand(cmd) {
    if (!rxCharacteristic) return;
    const encoder = new TextEncoder();
    await rxCharacteristic.writeValue(encoder.encode(cmd));
}

async function authenticate() {
    const code = document.getElementById('codeInput').value;
    if (code.length >= 4) {
        document.getElementById('authBtn').disabled = true;
        document.getElementById('authBtn').textContent = "Prüfe...";
        await sendCommand("CHECKCODE:" + code);
        document.getElementById('authBtn').disabled = false;
        document.getElementById('authBtn').textContent = "Authentifizieren";
    } else {
        const authMsg = document.getElementById('authMessage');
        authMsg.textContent = "Der Code muss mindestens 4 Zeichen lang sein!";
        authMsg.className = "error";
        authMsg.style.display = "block";
    }
}

async function setCode() {
    const code = document.getElementById('newCode').value;
    if (code.length >= 4 && code.length <= 16) {
        document.getElementById('setCodeBtn').disabled = true;
        document.getElementById('setCodeBtn').textContent = "Speichere...";
        await sendCommand("SETCODE:" + code);
        document.getElementById('setCodeBtn').disabled = false;
        document.getElementById('setCodeBtn').textContent = "Code speichern";
    } else {
        const authMsg = document.getElementById('authMessage');
        authMsg.textContent = "Der Code muss zwischen 4 und 16 Zeichen lang sein!";
        authMsg.className = "error";
        authMsg.style.display = "block";
    }
}

async function logout() {
    await sendCommand("LOGOUT");
}

function showCodeChange() {
    const codeArea = document.getElementById('codeInputArea');
    codeArea.innerHTML = `
        <p>Aktuellen Sicherheitscode bestätigen:</p>
        <input type="password" id="currentCode" placeholder="Aktueller Code">
        <p>Neuen Sicherheitscode eingeben:</p>
        <input type="password" id="newChangeCode" placeholder="Neuer Code (4-16 Zeichen)">
        <div class="button-group">
            <button id="confirmChangeBtn">Ändern</button>
            <button id="cancelChangeBtn">Abbrechen</button>
        </div>
    `;
    document.getElementById('confirmChangeBtn').addEventListener('click', changeCode);
    document.getElementById('cancelChangeBtn').addEventListener('click', updateUI);
}

async function changeCode() {
    const current = document.getElementById('currentCode').value;
    const newCode = document.getElementById('newChangeCode').value;
    const authMsg = document.getElementById('authMessage');
    
    if (current && newCode.length >= 4 && newCode.length <= 16) {
        document.getElementById('confirmChangeBtn').disabled = true;
        document.getElementById('confirmChangeBtn').textContent = "Prüfe...";
        await sendCommand("CHECKCODE:" + current);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (isAuthenticated) {
            document.getElementById('confirmChangeBtn').textContent = "Speichere...";
            await sendCommand("SETCODE:" + newCode);
            authMsg.textContent = "Sicherheitscode erfolgreich geändert!";
            authMsg.className = "success";
            authMsg.style.display = "block";
            updateUI();
        } else {
            authMsg.textContent = "Aktueller Code ist falsch!";
            authMsg.className = "error";
            authMsg.style.display = "block";
        }
        document.getElementById('confirmChangeBtn').disabled = false;
        document.getElementById('confirmChangeBtn').textContent = "Ändern";
    } else {
        authMsg.textContent = "Ungültige Eingabe! Bitte geben Sie den aktuellen Code ein und einen neuen Code mit 4-16 Zeichen.";
        authMsg.className = "error";
        authMsg.style.display = "block";
    }
}

// Beep-Zeit Einstellungen
document.getElementById('saveBeepTimesBtn').addEventListener('click', async function() {
    const doubleBeep = parseInt(document.getElementById('doubleBeepInput').value);
    const longBeep = parseInt(document.getElementById('longBeepInput').value);
    const errorMsg = document.getElementById('beepTimeError');
    const successMsg = document.getElementById('beepTimeSuccess');

    // Validierung
    if (isNaN(doubleBeep) || doubleBeep < 0 || doubleBeep > 180) {
        errorMsg.textContent = "Doppelbeep-Zeit muss zwischen 0 und 180 Sekunden liegen!";
        errorMsg.style.display = "block";
        return;
    }
    if (isNaN(longBeep) || longBeep < 0 || longBeep > 300) {
        errorMsg.textContent = "Dauerbeep-Zeit muss zwischen 0 und 300 Sekunden liegen!";
        errorMsg.style.display = "block";
        return;
    }

    errorMsg.style.display = "none";
    this.disabled = true;
    this.textContent = "Speichere...";

    await sendCommand("SETDELAYS:" + doubleBeep + "," + longBeep);

    this.disabled = false;
    this.textContent = "Zeiten speichern";
});

// Initialisierung
document.getElementById('connectBtn').addEventListener('click', connect);
document.getElementById('disconnectBtn').addEventListener('click', disconnect);
document.getElementById('blinkerOnBtn').addEventListener('click', async () => {
    document.getElementById('blinkerOnBtn').disabled = true;
    document.getElementById('blinkerOnBtn').textContent = "Aktiviere...";
    await sendCommand("BLINKSAVE_EIN");
    document.getElementById('blinkerOnBtn').disabled = false;
});
document.getElementById('blinkerOffBtn').addEventListener('click', async () => {
    document.getElementById('blinkerOffBtn').disabled = true;
    document.getElementById('blinkerOffBtn').textContent = "Deaktiviere...";
    await sendCommand("BLINKSAVE_AUS");
    document.getElementById('blinkerOffBtn').disabled = false;
});

if (!navigator.bluetooth) {
    document.getElementById('connectionStatus').textContent = 
        "Web Bluetooth wird von diesem Browser nicht unterstützt";
    document.getElementById('connectBtn').disabled = true;
}
