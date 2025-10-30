// Coalition Simulator App
let parties = [];
let statements = [];
let coalitionParties = new Set();
let statementsMetadata = null;
let seatsMetadata = null;

// Party name mapping: NOS API → Statements data
const PARTY_NAME_MAP = {
    'GLPVDA': 'GroenLinks-PvdA',
    'CU': 'ChristenUnie',
    'FVD': 'FvD',
    'PVDD': 'Partij voor de Dieren',
    'LP': 'Libertaire Partij',
    'DELINIE': 'De Linie',
    'VREVDIER': 'Vrede voor Dieren',
    'VRIJVER': 'Vrij Verbond',
    'PIRATEN': 'Piratenpartij',
    'NLPLAN': 'NL PLAN',
    'PVDR': 'Partij voor de Rechtsstaat',
    'ELLECT': 'ELLECT',
    'OVERIG': 'Overige'
};

// Load data
async function loadData() {
    try {
        // Load party seats from NOS VoteFlow API
        const nosResponse = await fetch('https://voteflow.api.nos.nl/TK25/index.json');
        const nosData = await nosResponse.json();
        
        // Extract parties with seats from NOS data and map names
        const nosParties = nosData.landelijke_uitslag.partijen
            .filter(p => p.huidig.zetels > 0)
            .map(p => {
                const nosName = p.partij.short_name;
                const mappedName = PARTY_NAME_MAP[nosName] || nosName;
                return {
                    party: mappedName,
                    name: mappedName,
                    seats: p.huidig.zetels,
                    votes: p.huidig.stemmen,
                    nosName: nosName  // Keep original for reference
                };
            })
            .sort((a, b) => b.seats - a.seats || b.votes - a.votes);
        
        parties = nosParties;
        
        // Create metadata from NOS data
        const publicationDate = new Date(nosData.landelijke_uitslag.publicatie_datum_tijd);
        seatsMetadata = {
            source: 'NOS VoteFlow API (Live)',
            source_url: 'https://voteflow.api.nos.nl/TK25/index.json',
            election: 'Tweede Kamer 2025',
            date: publicationDate.toLocaleDateString('nl-NL'),
            publication_datetime: nosData.landelijke_uitslag.publicatie_datum_tijd,
            municipalities_counted: nosData.landelijke_uitslag.aantal_uitslagen,
            total_municipalities: 342,
            status: nosData.landelijke_uitslag.aantal_uitslagen === 342 ? 'Eindstand' : 'Tussenstand',
            turnout_percentage: nosData.landelijke_uitslag.huidige_verkiezing.opkomst_promillage / 10,
            note: `${nosData.landelijke_uitslag.aantal_uitslagen}/342 gemeenten geteld. Opkomst: ${(nosData.landelijke_uitslag.huidige_verkiezing.opkomst_promillage / 10).toFixed(1)}%`
        };
        
        // Load statements
        const statementsResponse = await fetch('statements_wide.json');
        const statementsData = await statementsResponse.json();
        statements = statementsData.statements;
        statementsMetadata = statementsData.metadata;
        
        initializeApp();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Fout bij het laden van data. Controleer de internetverbinding.');
    }
}

function initializeApp() {
    renderParties();
    renderStatements();
    updateCoalitionBar();
    populateRequiredPartyDropdown();
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
        const statusBadge = seatsMetadata.status === 'Eindstand'
            ? '<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">✓ Officiële Eindstand</span>'
            : '<span style="background: #ffc107; color: #000; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">⏳ Tussenstand</span>';
        
        html += `
            <p><strong>Zetelverdeling:</strong> <a href="${seatsMetadata.source_url}" target="_blank">${seatsMetadata.source}</a> ${statusBadge}</p>
            <p>${seatsMetadata.election} - ${seatsMetadata.date}</p>
            <p><small>${seatsMetadata.note}</small></p>
            <p><small>Data wordt live opgehaald van de NOS VoteFlow API</small></p>
        `;
    }
    
    container.innerHTML = html;
}

function populateRequiredPartyDropdown() {
    const select = document.getElementById('requiredParty');
    
    // Clear existing options except the first one
    select.innerHTML = '<option value="">Geen voorkeur</option>';
    
    // Add all parties as options
    parties.forEach(party => {
        const option = document.createElement('option');
        option.value = party.name;
        option.textContent = `${party.name} (${party.seats} zetels)`;
        select.appendChild(option);
    });
}

// Find the most harmonious coalitions
function findBestCoalitions() {
    const btn = document.getElementById('findCoalition');
    btn.textContent = '🔍 Berekenen...';
    btn.disabled = true;
    
    // Get required party if selected
    const requiredParty = document.getElementById('requiredParty').value;
    
    // Calculate all possible majority coalitions
    const coalitions = generateMajorityCoalitions(requiredParty);
    
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

function generateMajorityCoalitions(requiredPartyName = null) {
    const coalitions = [];
    
    // Separate required party from available parties
    const requiredParties = requiredPartyName
        ? parties.filter(p => p.name === requiredPartyName)
        : [];
    
    if (requiredPartyName && requiredParties.length === 0) {
        return coalitions; // Required party not found
    }
    
    const availableParties = requiredPartyName
        ? parties.filter(p => p.name !== requiredPartyName)
        : parties;
    
    // Calculate how many additional parties we can add (max 5 total)
    const maxSize = Math.min(5 - requiredParties.length, availableParties.length);
    
    // Generate combinations of available parties
    for (let size = 1; size <= maxSize; size++) {
        const combinations = getCombinations(availableParties, size);
        for (const combo of combinations) {
            const coalition = [...requiredParties, ...combo];
            const seats = coalition.reduce((sum, p) => sum + p.seats, 0);
            
            if (seats >= 76) {
                coalitions.push(coalition);
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
    let totalAgreementScore = 0;
    let totalStatements = statements.length;
    
    // For each statement, calculate agreement score (0-1 scale)
    statements.forEach(statement => {
        const stances = coalition.map(party => ({
            party: party.name,
            stance: statement.positions[party.name],
            seats: party.seats
        }));
        
        // Count seats by stance
        let agreeSeats = 0, neutralSeats = 0, disagreeSeats = 0;
        stances.forEach(s => {
            if (s.stance === 1) agreeSeats += s.seats;
            else if (s.stance === 0) neutralSeats += s.seats;
            else if (s.stance === -1) disagreeSeats += s.seats;
        });
        
        const totalSeats = agreeSeats + neutralSeats + disagreeSeats;
        if (totalSeats === 0) return;
        
        const maxSeats = Math.max(agreeSeats, neutralSeats, disagreeSeats);
        const majorityFraction = maxSeats / totalSeats;
        
        // Calculate agreement score: 0 at 50% (completely divided), 1 at 100% (unanimous)
        // Formula: (majorityFraction - 0.5) / 0.5
        // This maps: 50% -> 0, 75% -> 0.5, 100% -> 1
        const agreementScore = Math.max(0, (majorityFraction - 0.5) / 0.5);
        totalAgreementScore += agreementScore;
    });
    
    const seats = coalition.reduce((sum, p) => sum + p.seats, 0);
    const averageAgreement = totalAgreementScore / totalStatements;
    
    // Apply size penalty: prefer smaller coalitions with equal agreement
    // Penalty: 5% per party beyond 2 parties (so 3 parties = -5%, 4 parties = -10%, etc.)
    const sizePenalty = Math.max(0, (coalition.length - 2) * 0.05);
    const adjustedAgreement = Math.max(0, averageAgreement - sizePenalty);
    
    const agreementRate = adjustedAgreement * 100;
    
    return {
        agreementRate: Math.round(agreementRate * 10) / 10,
        averageAgreement: Math.round(averageAgreement * 1000) / 1000,
        adjustedAgreement: Math.round(adjustedAgreement * 1000) / 1000,
        coalitionSize: coalition.length,
        totalStatements,
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
    
    const requiredParty = document.getElementById('requiredParty').value;
    const headerText = requiredParty
        ? `🏆 Top ${scoredCoalitions.length} Meest Harmonieuze Coalitions met ${requiredParty}`
        : `🏆 Top ${scoredCoalitions.length} Meest Harmonieuze Coalitions`;
    
    container.innerHTML = `
        <h3>${headerText}</h3>
        <p style="color: #6c757d; font-size: 0.9em; margin-bottom: 15px;">
            Eensgezindheid: 0% = 50-50 verdeeld, 100% = volledig eens over alle stellingen
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
                        <span class="stat-agreement">${score.agreementRate}% eensgezind</span>
                    </div>
                </div>
            </div>
            <div class="suggestion-details">
                Eensgezindheid: ${Math.round(score.averageAgreement * 100)}% (${score.coalitionSize} partijen, -${(score.coalitionSize - 2) * 5}% grootte-penalty = ${score.agreementRate}%)
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
    updateAgreementOverview();
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

function updateAgreementOverview() {
    const overview = document.getElementById('agreementOverview');
    const bar = document.getElementById('agreementBar');
    const legend = document.getElementById('agreementLegend');
    
    if (coalitionParties.size === 0) {
        overview.style.display = 'none';
        return;
    }
    
    const coalitionPartiesList = parties.filter(p => coalitionParties.has(p.name));
    if (coalitionPartiesList.length === 0) {
        overview.style.display = 'none';
        return;
    }
    
    // Count statements by agreement level
    let unified = 0;      // ≥80% agree (🤝)
    let moderate = 0;     // 60-80% agree (😐)
    let divided = 0;      // <60% agree (⚡)
    
    statements.forEach(statement => {
        // Count seats by stance
        let agreeSeats = 0, neutralSeats = 0, disagreeSeats = 0;
        coalitionPartiesList.forEach(party => {
            const stance = statement.positions[party.name];
            if (stance === 1) agreeSeats += party.seats;
            else if (stance === 0) neutralSeats += party.seats;
            else if (stance === -1) disagreeSeats += party.seats;
        });
        
        const totalSeats = agreeSeats + neutralSeats + disagreeSeats;
        if (totalSeats === 0) return;
        
        const maxSeats = Math.max(agreeSeats, neutralSeats, disagreeSeats);
        const agreementRate = (maxSeats / totalSeats) * 100;
        
        if (agreementRate >= 80) unified++;
        else if (agreementRate >= 60) moderate++;
        else divided++;
    });
    
    const total = unified + moderate + divided;
    if (total === 0) {
        overview.style.display = 'none';
        return;
    }
    
    // Calculate percentages
    const unifiedPercent = (unified / total) * 100;
    const moderatePercent = (moderate / total) * 100;
    const dividedPercent = (divided / total) * 100;
    
    // Update bar
    bar.innerHTML = `
        ${unified > 0 ? `<div class="agreement-segment agreement-unified" style="width: ${unifiedPercent}%" title="${unified} stellingen: Hoge eensgezindheid (≥80%)">
            ${unified > 0 ? `🤝 ${unified}` : ''}
        </div>` : ''}
        ${moderate > 0 ? `<div class="agreement-segment agreement-moderate" style="width: ${moderatePercent}%" title="${moderate} stellingen: Gemiddelde eensgezindheid (60-80%)">
            ${moderate > 0 ? `😐 ${moderate}` : ''}
        </div>` : ''}
        ${divided > 0 ? `<div class="agreement-segment agreement-divided" style="width: ${dividedPercent}%" title="${divided} stellingen: Verdeeld (<60%)">
            ${divided > 0 ? `⚡ ${divided}` : ''}
        </div>` : ''}
    `;
    
    // Update legend
    legend.innerHTML = `
        <div class="legend-item">
            <div class="legend-color legend-unified"></div>
            <span class="legend-label">🤝 Eensgezind:</span>
            <span class="legend-count">${unified} stellingen</span>
        </div>
        <div class="legend-item">
            <div class="legend-color legend-moderate"></div>
            <span class="legend-label">😐 Gemiddeld:</span>
            <span class="legend-count">${moderate} stellingen</span>
        </div>
        <div class="legend-item">
            <div class="legend-color legend-divided"></div>
            <span class="legend-label">⚡ Verdeeld:</span>
            <span class="legend-count">${divided} stellingen</span>
        </div>
    `;
    
    overview.style.display = 'block';
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
            <div class="coalition-consistency-bar" id="consistency-bar-${statement.id}"></div>
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
        updateConsistencyBar(statement);
    });
}

function updateStatementIndicator(statement) {
    const indicator = document.getElementById(`indicator-${statement.id}`);
    const statementItem = document.querySelector(`[data-statement-id="${statement.id}"]`);
    
    if (!indicator) return;
    
    if (coalitionParties.size === 0) {
        indicator.textContent = '';
        indicator.title = '';
        if (statementItem) {
            statementItem.style.borderLeft = '';
            statementItem.style.boxShadow = '';
        }
        return;
    }
    
    // Calculate coalition agreement on this statement based on seats
    const coalitionPartiesList = parties.filter(p => coalitionParties.has(p.name));
    if (coalitionPartiesList.length === 0) {
        indicator.textContent = '';
        if (statementItem) {
            statementItem.style.borderLeft = '';
            statementItem.style.boxShadow = '';
        }
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
        if (statementItem) {
            statementItem.style.borderLeft = '';
            statementItem.style.boxShadow = '';
        }
        return;
    }
    
    // Calculate what percentage agrees with the majority position
    const maxSeats = Math.max(agreeSeats, neutralSeats, disagreeSeats);
    const agreementRate = (maxSeats / totalSeats) * 100;
    
    // Determine majority position
    let majorityStance = '';
    let borderColor = '';
    let shadowColor = '';
    let showBorder = false;
    
    if (maxSeats === agreeSeats) {
        majorityStance = 'eens';
        borderColor = '#28a745';  // Green for agree
        shadowColor = 'rgba(40, 167, 69, 0.15)';
        showBorder = agreementRate >= 60;  // Only show if ≥60% agree
    } else if (maxSeats === disagreeSeats) {
        majorityStance = 'oneens';
        borderColor = '#dc3545';  // Red for disagree
        shadowColor = 'rgba(220, 53, 69, 0.15)';
        showBorder = agreementRate >= 60;  // Only show if ≥60% disagree
    } else {
        majorityStance = 'neutraal';
        showBorder = false;  // Never highlight neutral
    }
    
    // Set emoji based on unity level
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
    
    // Apply border only for clear stances (agree/disagree with ≥60% unity)
    if (statementItem) {
        if (showBorder) {
            statementItem.style.borderLeft = `4px solid ${borderColor}`;
            statementItem.style.boxShadow = `0 2px 8px ${shadowColor}`;
        } else {
            statementItem.style.borderLeft = '';
            statementItem.style.boxShadow = '';
        }
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
    
    // Calculate coalition stances and collect party names
    let agreeSeats = 0, neutralSeats = 0, disagreeSeats = 0;
    let agreeParties = [], neutralParties = [], disagreeParties = [];
    
    parties.forEach(party => {
        if (coalitionParties.has(party.name)) {
            const stance = statement.positions[party.name];
            if (stance === 1) {
                agreeSeats += party.seats;
                agreeParties.push(`${party.name} (${party.seats})`);
            } else if (stance === 0) {
                neutralSeats += party.seats;
                neutralParties.push(`${party.name} (${party.seats})`);
            } else if (stance === -1) {
                disagreeSeats += party.seats;
                disagreeParties.push(`${party.name} (${party.seats})`);
            }
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
    
    // Create tooltips
    const agreeTooltip = agreeParties.length > 0 ? `Eens (${agreeSeats} zetels):\n${agreeParties.join('\n')}` : '';
    const neutralTooltip = neutralParties.length > 0 ? `Neutraal (${neutralSeats} zetels):\n${neutralParties.join('\n')}` : '';
    const disagreeTooltip = disagreeParties.length > 0 ? `Oneens (${disagreeSeats} zetels):\n${disagreeParties.join('\n')}` : '';
    
    bar.innerHTML = `
        <div class="stance-bar">
            ${agreeSeats > 0 ? `<div class="coalition-stance-segment coalition-agree" style="width: ${agreePercent}%" title="${agreeTooltip}">
                Eens: ${agreeSeats}
            </div>` : ''}
            ${neutralSeats > 0 ? `<div class="coalition-stance-segment coalition-neutral" style="width: ${neutralPercent}%" title="${neutralTooltip}">
                Neutraal: ${neutralSeats}
            </div>` : ''}
            ${disagreeSeats > 0 ? `<div class="coalition-stance-segment coalition-disagree" style="width: ${disagreePercent}%" title="${disagreeTooltip}">
                Oneens: ${disagreeSeats}
            </div>` : ''}
        </div>
    `;
}

function updateConsistencyBar(statement) {
    const barId = `consistency-bar-${statement.id}`;
    const bar = document.getElementById(barId);
    if (!bar) return;
    
    if (coalitionParties.size === 0) {
        bar.style.display = 'none';
        return;
    }
    
    // Calculate coalition agreement on this statement
    const coalitionPartiesList = parties.filter(p => coalitionParties.has(p.name));
    if (coalitionPartiesList.length === 0) {
        bar.style.display = 'none';
        return;
    }
    
    // Count seats by stance
    let agreeSeats = 0, neutralSeats = 0, disagreeSeats = 0;
    coalitionPartiesList.forEach(party => {
        const stance = statement.positions[party.name];
        if (stance === 1) agreeSeats += party.seats;
        else if (stance === 0) neutralSeats += party.seats;
        else if (stance === -1) disagreeSeats += party.seats;
    });
    
    const totalSeats = agreeSeats + neutralSeats + disagreeSeats;
    if (totalSeats === 0) {
        bar.style.display = 'none';
        return;
    }
    
    const maxSeats = Math.max(agreeSeats, neutralSeats, disagreeSeats);
    const agreementRate = (maxSeats / totalSeats) * 100;
    
    // Determine majority position
    let majorityStance = '';
    if (maxSeats === agreeSeats) majorityStance = 'eens';
    else if (maxSeats === disagreeSeats) majorityStance = 'oneens';
    else majorityStance = 'neutraal';
    
    // Show consistency bar
    bar.style.display = 'block';
    
    let emoji, color, label;
    if (agreementRate >= 80) {
        emoji = '🤝';
        color = '#28a745';
        label = 'Eensgezind';
    } else if (agreementRate >= 60) {
        emoji = '😐';
        color = '#ffc107';
        label = 'Gemiddeld';
    } else {
        emoji = '⚡';
        color = '#dc3545';
        label = 'Verdeeld';
    }
    
    // Determine badge color based on majority position
    let badgeColor = color;
    let badgeText = '';
    if (maxSeats === agreeSeats) {
        badgeColor = '#28a745';
        badgeText = 'Meerderheid Eens';
    } else if (maxSeats === disagreeSeats) {
        badgeColor = '#dc3545';
        badgeText = 'Meerderheid Oneens';
    } else {
        badgeColor = '#6c757d';
        badgeText = 'Meerderheid Neutraal';
    }
    
    bar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: ${color}15; border-left: 4px solid ${color}; border-radius: 4px; margin-bottom: 10px;">
            <span style="font-size: 1.5em;">${emoji}</span>
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <strong>${label}</strong>
                    <span style="background: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 600;">${badgeText}</span>
                </div>
                <div style="font-size: 0.85em; color: #495057;">
                    ${Math.round(agreementRate)}% van coalitie: ${agreeSeats} eens · ${neutralSeats} neutraal · ${disagreeSeats} oneens
                </div>
            </div>
        </div>
    `;
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', loadData);