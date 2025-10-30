// Coalition Simulator App
let parties = [];
let statements = [];
let coalitionParties = new Set();
let statementsMetadata = null;
let seatsMetadata = null;

// Load data
async function loadData() {
    try {
        // Load party seats
        const seatsResponse = await fetch('party_seats_exitpoll_2025.json');
        const seatsData = await seatsResponse.json();
        parties = seatsData.parties.filter(p => p.seats > 0);
        seatsMetadata = seatsData.metadata;
        
        // Load statements
        const statementsResponse = await fetch('statements_wide.json');
        const statementsData = await statementsResponse.json();
        statements = statementsData.statements;
        statementsMetadata = statementsData.metadata;
        
        initializeApp();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Fout bij het laden van data. Zorg dat de JSON bestanden beschikbaar zijn.');
    }
}

function initializeApp() {
    renderParties();
    renderStatements();
    updateCoalitionBar();
    setupEventListeners();
}

// Render party cards
function renderParties() {
    const availableContainer = document.getElementById('availableParties');
    availableContainer.innerHTML = '';
    
    parties.forEach(party => {
        if (!coalitionParties.has(party.name)) {
            const card = createPartyCard(party);
            availableContainer.appendChild(card);
        }
    });
}

function createPartyCard(party) {
    const card = document.createElement('div');
    card.className = 'party-card';
    card.draggable = true;
    card.dataset.partyName = party.name;
    card.dataset.seats = party.seats;
    
    card.innerHTML = `
        <span class="party-name">${party.name}</span>
        <span class="party-seats">${party.seats}</span>
    `;
    
    // Drag events
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    
    return card;
}

// Drag and Drop handlers
function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
    e.dataTransfer.setData('partyName', e.target.dataset.partyName);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function setupEventListeners() {
    const dropZones = document.querySelectorAll('.drop-zone');
    
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('drop', handleDrop);
        zone.addEventListener('dragleave', handleDragLeave);
    });
    
    // Statement controls
    document.getElementById('expandAll').addEventListener('click', () => {
        document.querySelectorAll('.statement-item').forEach(item => {
            item.classList.add('expanded');
        });
    });
    
    document.getElementById('collapseAll').addEventListener('click', () => {
        document.querySelectorAll('.statement-item').forEach(item => {
            item.classList.remove('expanded');
        });
    });
    
    // Coalition finder
    document.getElementById('findCoalition').addEventListener('click', findBestCoalitions);
    
    // Info modal
    const infoButton = document.getElementById('infoButton');
    const infoModal = document.getElementById('infoModal');
    const modalClose = document.querySelector('.modal-close');
    
    infoButton.addEventListener('click', () => {
        populateInfoModal();
        infoModal.classList.add('show');
    });
    
    modalClose.addEventListener('click', () => {
        infoModal.classList.remove('show');
    });
    
    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) {
            infoModal.classList.remove('show');
        }
    });
}

function populateInfoModal() {
    const container = document.getElementById('dataSourcesInfo');
    
    let html = '';
    
    // Statements info
    if (statementsMetadata) {
        html += `
            <p><strong>Stellingen:</strong> <a href="${statementsMetadata.url}" target="_blank">${statementsMetadata.source}</a></p>
            <p>${statementsMetadata.total_statements} stellingen over verschillende politieke onderwerpen, met standpunten van ${statementsMetadata.total_parties} politieke partijen.</p>
        `;
    }
    
    // Seats info
    if (seatsMetadata) {
        html += `
            <p><strong>Zetelverdeling:</strong> ${seatsMetadata.source}</p>
            <p>Exit poll uitgevoerd door ${seatsMetadata.pollster} op ${seatsMetadata.date}.</p>
            <p><small>${seatsMetadata.note}</small></p>
        `;
    }
    
    container.innerHTML = html;
}

// Find the most harmonious coalitions
function findBestCoalitions() {
    const btn = document.getElementById('findCoalition');
    btn.textContent = '🔍 Berekenen...';
    btn.disabled = true;
    
    // Calculate all possible majority coalitions
    const coalitions = generateMajorityCoalitions();
    
    // Score each coalition by agreement
    const scoredCoalitions = coalitions.map(coalition => {
        const score = calculateCoalitionAgreement(coalition);
        return { coalition, score };
    });
    
    // Sort by agreement score (higher is better)
    scoredCoalitions.sort((a, b) => b.score.agreementRate - a.score.agreementRate);
    
    // Show top 5 results
    displayCoalitionSuggestions(scoredCoalitions.slice(0, 5));
    
    btn.textContent = '🔍 Vind Meest Harmonieuze Coalitie';
    btn.disabled = false;
}

function generateMajorityCoalitions() {
    const coalitions = [];
    const n = parties.length;
    
    // Generate all possible combinations (up to 5 parties for performance)
    for (let size = 2; size <= Math.min(5, n); size++) {
        const combinations = getCombinations(parties, size);
        for (const combo of combinations) {
            const seats = combo.reduce((sum, p) => sum + p.seats, 0);
            if (seats >= 76) {
                coalitions.push(combo);
            }
        }
    }
    
    return coalitions;
}

function getCombinations(arr, size) {
    if (size === 1) return arr.map(item => [item]);
    
    const combinations = [];
    for (let i = 0; i <= arr.length - size; i++) {
        const head = arr[i];
        const tailCombos = getCombinations(arr.slice(i + 1), size - 1);
        for (const tail of tailCombos) {
            combinations.push([head, ...tail]);
        }
    }
    return combinations;
}

function calculateCoalitionAgreement(coalition) {
    let totalAgreements = 0;
    let totalComparisons = 0;
    
    // For each statement, check if coalition parties agree
    statements.forEach(statement => {
        const stances = coalition.map(party => statement.positions[party.name]);
        
        // Count pairwise agreements
        for (let i = 0; i < stances.length; i++) {
            for (let j = i + 1; j < stances.length; j++) {
                totalComparisons++;
                if (stances[i] === stances[j]) {
                    totalAgreements++;
                }
            }
        }
    });
    
    const agreementRate = totalComparisons > 0 ? (totalAgreements / totalComparisons) * 100 : 0;
    const seats = coalition.reduce((sum, p) => sum + p.seats, 0);
    
    return {
        agreementRate: Math.round(agreementRate * 10) / 10,
        totalAgreements,
        totalComparisons,
        seats
    };
}

function displayCoalitionSuggestions(scoredCoalitions) {
    const container = document.getElementById('coalitionSuggestions');
    
    if (scoredCoalitions.length === 0) {
        container.innerHTML = '<p>Geen meerderheidscoalities gevonden.</p>';
        container.classList.add('visible');
        return;
    }
    
    container.innerHTML = `
        <h3>🏆 Top ${scoredCoalitions.length} Meest Harmonieuze Coalitions</h3>
        <p style="color: #6c757d; font-size: 0.9em; margin-bottom: 15px;">
            Gebaseerd op onderlinge overeenstemming over alle 30 stellingen
        </p>
    `;
    
    scoredCoalitions.forEach((item, index) => {
        const { coalition, score } = item;
        const partyNames = coalition.map(p => p.name).join(' + ');
        
        const suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'suggestion-item';
        suggestionDiv.innerHTML = `
            <div class="suggestion-header">
                <div class="suggestion-parties">
                    ${index + 1}. ${partyNames}
                </div>
                <div class="suggestion-stats">
                    <div class="stat-item">
                        <span>💺</span>
                        <span class="stat-seats">${score.seats} zetels</span>
                    </div>
                    <div class="stat-item">
                        <span>🤝</span>
                        <span class="stat-agreement">${score.agreementRate}% eens</span>
                    </div>
                </div>
            </div>
            <div class="suggestion-details">
                ${score.totalAgreements} van ${score.totalComparisons} paarsgewijze vergelijkingen komen overeen
            </div>
        `;
        
        // Click to apply coalition
        suggestionDiv.addEventListener('click', () => {
            applyCoalition(coalition);
            container.classList.remove('visible');
        });
        
        container.appendChild(suggestionDiv);
    });
    
    container.classList.add('visible');
}

function applyCoalition(coalition) {
    // Clear current coalition
    coalitionParties.clear();
    
    // Add suggested parties
    coalition.forEach(party => {
        coalitionParties.add(party.name);
    });
    
    updateUI();
    
    // Scroll to top to see the result
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
    return false;
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    e.preventDefault();
    
    e.currentTarget.classList.remove('drag-over');
    
    const partyName = e.dataTransfer.getData('partyName');
    const targetZone = e.currentTarget.id;
    
    if (targetZone === 'coalitionParties') {
        coalitionParties.add(partyName);
    } else {
        coalitionParties.delete(partyName);
    }
    
    updateUI();
    return false;
}

function updateUI() {
    renderCoalitionParties();
    renderParties();
    updateCoalitionBar();
    updateStatementBars();
}

function renderCoalitionParties() {
    const coalitionContainer = document.getElementById('coalitionParties');
    coalitionContainer.innerHTML = '';
    
    parties.forEach(party => {
        if (coalitionParties.has(party.name)) {
            const card = createPartyCard(party);
            coalitionContainer.appendChild(card);
        }
    });
}

function updateCoalitionBar() {
    const coalitionSeats = calculateCoalitionSeats();
    const oppositionSeats = 150 - coalitionSeats;
    const percentage = (coalitionSeats / 150) * 100;
    
    document.getElementById('coalitionSeats').textContent = coalitionSeats;
    document.getElementById('oppositionSeats').textContent = oppositionSeats;
    
    const coalitionBar = document.getElementById('coalitionBar');
    coalitionBar.style.width = `${percentage}%`;
    coalitionBar.textContent = coalitionSeats >= 76 ? '✓ Meerderheid' : '';
    
    // Change color based on majority
    if (coalitionSeats >= 76) {
        coalitionBar.style.background = 'linear-gradient(90deg, #28a745 0%, #20c997 100%)';
    } else {
        coalitionBar.style.background = 'linear-gradient(90deg, #ffc107 0%, #ff9800 100%)';
    }
}

function calculateCoalitionSeats() {
    let total = 0;
    parties.forEach(party => {
        if (coalitionParties.has(party.name)) {
            total += party.seats;
        }
    });
    return total;
}

// Render statements
function renderStatements() {
    const container = document.getElementById('statementsList');
    container.innerHTML = '';
    
    statements.forEach((statement, index) => {
        const item = createStatementItem(statement, index);
        container.appendChild(item);
    });
}

function createStatementItem(statement, index) {
    const item = document.createElement('div');
    item.className = 'statement-item';
    item.dataset.statementId = statement.id;
    
    // Clean statement text (remove "Icon" artifacts)
    const cleanText = statement.text.replace(/Icon/g, '');
    
    item.innerHTML = `
        <div class="statement-header">
            <span class="statement-agreement-indicator" id="indicator-${statement.id}"></span>
            <span class="statement-text">${index + 1}. ${cleanText}</span>
            <span class="statement-toggle">▼</span>
        </div>
        <div class="statement-content">
            <div class="statement-bars">
                <div class="bar-section">
                    <div class="bar-title">Volledige Tweede Kamer (150 zetels)</div>
                    <div class="stance-bar" id="full-bar-${statement.id}"></div>
                </div>
                <div class="bar-section">
                    <div class="bar-title">Coalitie Standpunt</div>
                    <div class="coalition-stance-bar" id="coalition-bar-${statement.id}"></div>
                </div>
            </div>
        </div>
    `;
    
    // Toggle expand/collapse
    const header = item.querySelector('.statement-header');
    header.addEventListener('click', () => {
        item.classList.toggle('expanded');
    });
    
    return item;
}

function updateStatementBars() {
    statements.forEach(statement => {
        updateFullBar(statement);
        updateCoalitionBar_Statement(statement);
        updateStatementIndicator(statement);
    });
}

function updateStatementIndicator(statement) {
    const indicator = document.getElementById(`indicator-${statement.id}`);
    if (!indicator) return;
    
    if (coalitionParties.size === 0) {
        indicator.textContent = '';
        indicator.title = '';
        return;
    }
    
    // Calculate coalition agreement on this statement based on seats
    const coalitionPartiesList = parties.filter(p => coalitionParties.has(p.name));
    if (coalitionPartiesList.length === 0) {
        indicator.textContent = '';
        return;
    }
    
    // Count seats by stance
    let agreeSeats = 0;
    let neutralSeats = 0;
    let disagreeSeats = 0;
    
    coalitionPartiesList.forEach(party => {
        const stance = statement.positions[party.name];
        if (stance === 1) agreeSeats += party.seats;
        else if (stance === 0) neutralSeats += party.seats;
        else if (stance === -1) disagreeSeats += party.seats;
    });
    
    const totalSeats = agreeSeats + neutralSeats + disagreeSeats;
    if (totalSeats === 0) {
        indicator.textContent = '';
        return;
    }
    
    // Calculate what percentage agrees with the majority position
    const maxSeats = Math.max(agreeSeats, neutralSeats, disagreeSeats);
    const agreementRate = (maxSeats / totalSeats) * 100;
    
    // Determine majority position
    let majorityStance = '';
    if (maxSeats === agreeSeats) majorityStance = 'eens';
    else if (maxSeats === disagreeSeats) majorityStance = 'oneens';
    else majorityStance = 'neutraal';
    
    // Set emoji based on how unified the coalition is
    if (agreementRate >= 80) {
        indicator.textContent = '🤝';
        indicator.title = `${Math.round(agreementRate)}% ${majorityStance} - Hoge eensgezindheid`;
        indicator.style.fontSize = '1.5em';
    } else if (agreementRate >= 60) {
        indicator.textContent = '😐';
        indicator.title = `${Math.round(agreementRate)}% ${majorityStance} - Gemiddelde eensgezindheid`;
        indicator.style.fontSize = '1.5em';
    } else {
        indicator.textContent = '⚡';
        indicator.title = `${Math.round(agreementRate)}% ${majorityStance} - Verdeeld (${agreeSeats} eens, ${neutralSeats} neutraal, ${disagreeSeats} oneens)`;
        indicator.style.fontSize = '1.5em';
    }
}

function updateFullBar(statement) {
    const barId = `full-bar-${statement.id}`;
    const bar = document.getElementById(barId);
    if (!bar) return;
    
    // Calculate seat-weighted stances
    let agreeSeats = 0;
    let neutralSeats = 0;
    let disagreeSeats = 0;
    
    parties.forEach(party => {
        const stance = statement.positions[party.name];
        if (stance === 1) agreeSeats += party.seats;
        else if (stance === 0) neutralSeats += party.seats;
        else if (stance === -1) disagreeSeats += party.seats;
    });
    
    const total = agreeSeats + neutralSeats + disagreeSeats;
    const agreePercent = (agreeSeats / total) * 100;
    const neutralPercent = (neutralSeats / total) * 100;
    const disagreePercent = (disagreeSeats / total) * 100;
    
    bar.innerHTML = `
        ${agreeSeats > 0 ? `<div class="stance-segment stance-agree" style="width: ${agreePercent}%">
            Eens: ${agreeSeats}
        </div>` : ''}
        ${neutralSeats > 0 ? `<div class="stance-segment stance-neutral" style="width: ${neutralPercent}%">
            Neutraal: ${neutralSeats}
        </div>` : ''}
        ${disagreeSeats > 0 ? `<div class="stance-segment stance-disagree" style="width: ${disagreePercent}%">
            Oneens: ${disagreeSeats}
        </div>` : ''}
    `;
}

function updateCoalitionBar_Statement(statement) {
    const barId = `coalition-bar-${statement.id}`;
    const bar = document.getElementById(barId);
    if (!bar) return;
    
    if (coalitionParties.size === 0) {
        bar.innerHTML = '<div class="empty-coalition">Geen coalitie geselecteerd</div>';
        return;
    }
    
    // Calculate coalition stances
    let agreeSeats = 0;
    let neutralSeats = 0;
    let disagreeSeats = 0;
    
    parties.forEach(party => {
        if (coalitionParties.has(party.name)) {
            const stance = statement.positions[party.name];
            if (stance === 1) agreeSeats += party.seats;
            else if (stance === 0) neutralSeats += party.seats;
            else if (stance === -1) disagreeSeats += party.seats;
        }
    });
    
    const total = agreeSeats + neutralSeats + disagreeSeats;
    
    if (total === 0) {
        bar.innerHTML = '<div class="empty-coalition">Geen data beschikbaar</div>';
        return;
    }
    
    const agreePercent = (agreeSeats / total) * 100;
    const neutralPercent = (neutralSeats / total) * 100;
    const disagreePercent = (disagreeSeats / total) * 100;
    
    bar.innerHTML = `
        <div class="stance-bar">
            ${agreeSeats > 0 ? `<div class="coalition-stance-segment coalition-agree" style="width: ${agreePercent}%">
                Eens: ${agreeSeats}
            </div>` : ''}
            ${neutralSeats > 0 ? `<div class="coalition-stance-segment coalition-neutral" style="width: ${neutralPercent}%">
                Neutraal: ${neutralSeats}
            </div>` : ''}
            ${disagreeSeats > 0 ? `<div class="coalition-stance-segment coalition-disagree" style="width: ${disagreePercent}%">
                Oneens: ${disagreeSeats}
            </div>` : ''}
        </div>
    `;
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', loadData);