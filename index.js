require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages // Needed for Split or Steal and Admin Panel
    ],
    partials: ['CHANNEL'] // Needed to receive DMs
});

const OWNER_ID = process.env.OWNER_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// ==========================================
// 🎨 EMOJI CONFIGURATION 
// ==========================================
const EMOJI_CASH = '💵'; 
const EMOJI_SPIN = '🔄'; 
const EMOJI_COIN = '🪙'; 
const EMOJI_REACT = '<:catcool:1500960671024545812>'; 

let MAX_BET = 250000; // Now dynamic so it can be changed via the Admin Panel
let OVERWATCH_ENABLED = false;

// --- GLOBAL ESTATE MARKET ---
const ESTATE_MARKET = {
    '1': { name: '🏪 7-Eleven', cost: 5000, yield: 100 },
    '2': { name: '☕ Starbucks', cost: 25000, yield: 600 },
    '3': { name: '🍔 McDonald\'s', cost: 100000, yield: 2500 },
    '4': { name: '📺 Times Square Billboard', cost: 500000, yield: 14000 },
    '5': { name: '🎰 The Bellagio Casino', cost: 2500000, yield: 75000 },
    '6': { name: '🏰 Antilia Residence', cost: 10000000, yield: 350000 },
    '7': { name: '🏙️ The Shard', cost: 50000000, yield: 2000000 },
    '8': { name: '🍎 Apple Park HQ', cost: 250000000, yield: 12000000 },
    '9': { name: '🗼 Burj Khalifa', cost: 1000000000, yield: 55000000 },
    '10': { name: '🛰️ The ISS', cost: 10000000000, yield: 600000000 },
    '11': { name: '🚆 High-Speed Rail Network', cost: 50000000000, yield: 3000000000 },
    '12': { name: '🛢️ Ghawar Oil Field', cost: 250000000000, yield: 18000000000 },
    '13': { name: '🏙️ Neom Megacity', cost: 1000000000000, yield: 80000000000 },
    '14': { name: '🚢 Suez Canal', cost: 5000000000000, yield: 450000000000 },
    '15': { name: '🌐 Global Internet Backbone', cost: 25000000000000, yield: 2500000000000 }
};

// --- PVP GAME STATE TRACKERS ---
const pendingChallenges = new Map(); 
const activeFights = new Map(); 
const activeSplitSteal = new Map();
const ssUserMap = new Map();
const activeMines = new Map(); // Tracks active Minefield games
const activeTTT = new Map(); // Tracks active Tic-Tac-Toe games

// --- COOLDOWN TRACKER ---
const casinoCooldowns = new Map(); // Tracks casino game spam
const CASINO_COOLDOWN_MS = 4000; // 4 seconds between bets

// --- JOKE TRACKER ---
const recentJokes = new Map(); 
const JOKE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour in milliseconds

// --- DATABASE MANAGER ---
const dbFile = './economy.json';
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '{}');

function getDb() { return JSON.parse(fs.readFileSync(dbFile)); }
function saveDb(data) { fs.writeFileSync(dbFile, JSON.stringify(data, null, 2)); }

function initUser(db, userId) {
    if (!db[userId]) db[userId] = { bal: 0, bank: 0, lastDaily: 0, hasAccess: false, isCursed: false, isLucky: false, crypto: { btc: 0, eth: 0, doge: 0, sol: 0, xrp: 0, ada: 0 } };
    
    // 🩹 AUTO-HEAL CORRUPTED DATA (fixes the JSON NaN -> null serialization crash)
    if (db[userId].bal === null || isNaN(db[userId].bal)) db[userId].bal = 0;
    if (db[userId].bank === null || isNaN(db[userId].bank)) db[userId].bank = 0;
    
    if (db[userId].bank === undefined) db[userId].bank = 0; 
    if (db[userId].isCursed === undefined) db[userId].isCursed = false;
    if (db[userId].isLucky === undefined) db[userId].isLucky = false;
    
    // Safety check for legacy users missing new crypto fields
    if (!db[userId].crypto) db[userId].crypto = { btc: 0, eth: 0, doge: 0, sol: 0, xrp: 0, ada: 0 };
    if (db[userId].crypto.sol === undefined) db[userId].crypto.sol = 0;
    if (db[userId].crypto.xrp === undefined) db[userId].crypto.xrp = 0;
    if (db[userId].crypto.ada === undefined) db[userId].crypto.ada = 0;

    if (!db[userId].estate) {
        db[userId].estate = { lastCollect: Date.now(), props: { '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0, '10':0, '11':0, '12':0, '13':0, '14':0, '15':0 } };
    } else {
        // 🩹 Patch existing users with the new properties seamlessly
        for (let i = 11; i <= 15; i++) {
            if (db[userId].estate.props[i.toString()] === undefined) {
                db[userId].estate.props[i.toString()] = 0;
            }
        }
    }
}

function getBal(userId) { 
    const db = getDb(); 
    initUser(db, userId);
    return db[userId].bal; 
}

function addBal(userId, amount) {
    const db = getDb();
    initUser(db, userId);
    db[userId].bal += amount;
    saveDb(db);
}

function checkDaily(userId) {
    const db = getDb();
    initUser(db, userId);
    const now = Date.now();
    if (now - db[userId].lastDaily >= 86400000) { 
        db[userId].lastDaily = now;
        db[userId].bal += 500;
        saveDb(db);
        return true;
    }
    return false;
}

// Global Net Worth Calculator (Wallet + Bank + Unclaimed Rent + Total Crypto)
function calcNetWorth(userId, db, mkt) {
    const p = db[userId];
    let pYield = 0;
    for (let i = 1; i <= 15; i++) pYield += (p.estate.props[i.toString()] || 0) * ESTATE_MARKET[i.toString()].yield;
    const pHoursPassed = (Date.now() - p.estate.lastCollect) / (1000 * 60 * 60);
    const pPendingRent = Math.floor(pHoursPassed * pYield);

    // Fallbacks added here to prevent crashes if DB isn't perfectly synced
    const cryptoValue = Math.floor(
        (p.crypto.btc * (mkt.btc?.price || 60000)) + 
        (p.crypto.eth * (mkt.eth?.price || 3000)) + 
        (p.crypto.doge * (mkt.doge?.price || 10)) +
        (p.crypto.sol * (mkt.sol?.price || 150)) +
        (p.crypto.xrp * (mkt.xrp?.price || 5)) +
        (p.crypto.ada * (mkt.ada?.price || 2))
    );

    return Math.floor(p.bal + p.bank + pPendingRent + cryptoValue);
}

// ==========================================
// 📈 MARKET ENGINE
// ==========================================
function updateMarket() {
    const db = getDb();
    let forceSave = false;

    if (!db.market) {
        db.market = {
            lastUpdate: Date.now(),
            btc: { price: 60000, last: 60000 },
            eth: { price: 3000, last: 3000 },
            doge: { price: 10, last: 10 },
            sol: { price: 150, last: 150 },
            xrp: { price: 5, last: 5 },
            ada: { price: 2, last: 2 }
        };
        saveDb(db);
        return db.market;
    }

    if (!db.market.sol) { db.market.sol = { price: 150, last: 150 }; forceSave = true; }
    if (!db.market.xrp) { db.market.xrp = { price: 5, last: 5 }; forceSave = true; }
    if (!db.market.ada) { db.market.ada = { price: 2, last: 2 }; forceSave = true; }
    
    if (forceSave) saveDb(db);

    const now = Date.now();
    if (now - db.market.lastUpdate >= 30 * 60 * 1000) { 
        db.market.lastUpdate = now;

        // BTC: Low Volatility (±3%)
        db.market.btc.last = db.market.btc.price;
        db.market.btc.price = Math.max(1000, Math.floor(db.market.btc.price * (1 + (Math.random() * 0.06 - 0.03))));

        // ETH: Medium Volatility (±10%)
        db.market.eth.last = db.market.eth.price;
        db.market.eth.price = Math.max(100, Math.floor(db.market.eth.price * (1 + (Math.random() * 0.20 - 0.10))));

        // DOGE: Extreme Volatility (-80% Crash or +300% Moon)
        db.market.doge.last = db.market.doge.price;
        const roll = Math.random();
        if (roll < 0.10) { 
            db.market.doge.price = Math.floor(db.market.doge.price * (2 + Math.random() * 2)); 
        } else if (roll < 0.30) {
            db.market.doge.price = Math.max(1, Math.floor(db.market.doge.price * (0.2 + Math.random() * 0.3))); 
        } else {
            db.market.doge.price = Math.max(1, Math.floor(db.market.doge.price * (1 + (Math.random() * 0.40 - 0.20)))); 
        }

        // SOL: Medium-High Volatility (±15%)
        db.market.sol.last = db.market.sol.price;
        db.market.sol.price = Math.max(10, Math.floor(db.market.sol.price * (1 + (Math.random() * 0.30 - 0.15))));

        // XRP: Low Volatility (±5%)
        db.market.xrp.last = db.market.xrp.price;
        db.market.xrp.price = Math.max(1, Math.floor(db.market.xrp.price * (1 + (Math.random() * 0.10 - 0.05))));

        // ADA: Low-Medium Volatility (±8%)
        db.market.ada.last = db.market.ada.price;
        db.market.ada.price = Math.max(1, Math.floor(db.market.ada.price * (1 + (Math.random() * 0.16 - 0.08))));

        saveDb(db);
    }
    return db.market;
}

// 🛡️ Bulletproof formatting helper
const fmt = (num) => (num === null || isNaN(num) ? 0 : Number(num)).toLocaleString('en-US');
const fmtCrypto = (num) => Number(num.toFixed(4));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const generateHpBar = (hp) => {
    const filled = Math.max(0, Math.ceil(hp / 10));
    const empty = Math.max(0, 10 - filled);
    return '█'.repeat(filled) + '░'.repeat(empty);
};

// --- TTT LOGIC HELPER ---
function checkTTTWin(board) {
    const winLines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
        [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    for (const [a, b, c] of winLines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a]; // Returns 'X' or 'O'
        }
    }
    if (!board.includes(null)) return 'DRAW';
    return null;
}

// --- TTT UI BUILDER ---
function buildTTTBoard(game) {
    const rows = [];
    for (let i = 0; i < 3; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
            const index = i * 3 + j;
            const val = game.board[index];
            
            let btn = new ButtonBuilder()
                .setCustomId(`ttt_${index}`)
                .setDisabled(val !== null || !game.active);

            if (val === 'X') {
                btn.setEmoji('❌').setStyle(ButtonStyle.Danger);
            } else if (val === 'O') {
                btn.setEmoji('⭕').setStyle(ButtonStyle.Primary);
            } else {
                btn.setEmoji('🟦').setStyle(ButtonStyle.Secondary);
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }
    return rows;
}

// --- MINEFIELD UI BUILDER ---
function buildMinesBoard(game, revealAll = false) {
    const rows = [];
    for (let i = 0; i < 4; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 5; j++) {
            const index = i * 5 + j;
            const isRevealed = game.revealed.includes(index) || revealAll;
            const isBomb = game.grid[index] === 'bomb';
            
            let btn = new ButtonBuilder().setCustomId(`mine_${index}`);
            
            if (isRevealed) {
                btn.setEmoji(isBomb ? '💣' : '💎')
                   .setStyle(isBomb ? ButtonStyle.Danger : ButtonStyle.Primary)
                   .setDisabled(true);
            } else {
                btn.setEmoji('🟦').setStyle(ButtonStyle.Secondary);
                if (revealAll) btn.setDisabled(true);
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }
    
    const cashoutRow = new ActionRowBuilder();
    const cashoutBtn = new ButtonBuilder()
        .setCustomId('mine_cashout')
        .setLabel(`💰 CASHOUT: ${fmt(Math.floor(game.bet * game.multiplier))} ${EMOJI_CASH}`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(revealAll || game.revealed.length === 0);
    
    cashoutRow.addComponents(cashoutBtn);
    rows.push(cashoutRow);
    
    return rows;
}

// --- OVERSEER LOGGING ENGINE ---
async function logEvent(embed) {
    if (LOG_CHANNEL_ID) {
        try {
            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) await logChannel.send({ embeds: [embed] });
        } catch (error) {}
    }
    
    if (OWNER_ID) {
        try {
            const owner = await client.users.fetch(OWNER_ID);
            if (owner) await owner.send({ embeds: [embed] });
        } catch (error) {}
    }
}

const snipeCache = new Map();
let hijackedTarget = null; 

client.once('clientReady', () => {
    console.log(`Rasp Master V28 online. Luck Protocol Injected. Target locked.`);
    client.user.setActivity('the casino | rasp help', { type: 'WATCHING' });
    updateMarket(); 
});

// PASSIVE LOGGERS
client.on('messageDelete', message => {
    if (message.author?.bot) return;
    if (message.mentions.users.has(OWNER_ID)) message.channel.send(`🚨 **Ghost Ping Alert:** ${message.author} tried to ping the boss and run.`);
    snipeCache.set(message.channel.id, { content: message.content, author: message.author.tag, pfp: message.author.displayAvatarURL() });
    const logEmbed = new EmbedBuilder().setColor('#ff0000').setTitle('🗑️ Message Deleted').addFields({ name: 'Author', value: `${message.author.tag}` }, { name: 'Channel', value: `<#${message.channel.id}>` }, { name: 'Content', value: message.content || '*[Media]*' }).setTimestamp();
    logEvent(logEmbed);
});
client.on('messageUpdate', (oldMessage, newMessage) => {
    if (oldMessage.author?.bot || oldMessage.content === newMessage.content) return; 
    const logEmbed = new EmbedBuilder().setColor('#ffff00').setTitle('✏️ Message Edited').addFields({ name: 'Author', value: `${oldMessage.author.tag}` }, { name: 'Channel', value: `<#${oldMessage.channel.id}>` }, { name: 'Before', value: oldMessage.content || '*[Empty]*' }, { name: 'After', value: newMessage.content || '*[Empty]*' }).setTimestamp();
    logEvent(logEmbed);
});

// --- INTERACTIVE COMPONENT LISTENER ---
client.on('interactionCreate', async interaction => {
    // --- ADMIN PANEL MODALS & BUTTONS ---
    if (interaction.isButton() && interaction.customId.startsWith('panel_')) {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: "Access Denied. Matrix rejects your signature.", flags: ['Ephemeral'] });
        
        if (interaction.customId === 'panel_limits') {
            const modal = new ModalBuilder().setCustomId('modal_limits').setTitle('🏦 Edit House Limits');
            const input = new TextInputBuilder().setCustomId('new_limit').setLabel('New Max Bet Amount').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
        else if (interaction.customId === 'panel_stimulus') {
            const modal = new ModalBuilder().setCustomId('modal_stimulus').setTitle('💸 Global Stimulus');
            const input = new TextInputBuilder().setCustomId('stim_amt').setLabel('Amount to inject per user').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
        else if (interaction.customId === 'panel_tax') {
            const modal = new ModalBuilder().setCustomId('modal_tax').setTitle('🩸 Global Syndicate Tax');
            const input = new TextInputBuilder().setCustomId('tax_pct').setLabel('Tax Percentage (1-100)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
        else if (interaction.customId === 'panel_reset') {
            const modal = new ModalBuilder().setCustomId('modal_reset').setTitle('🛑 GLOBAL WIPE');
            const input = new TextInputBuilder().setCustomId('confirm_wipe').setLabel('Type WIPE to erase EVERYTHING').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
        else if (interaction.customId === 'panel_rig') {
            const modal = new ModalBuilder().setCustomId('modal_rig').setTitle('📈 Rig Crypto Market');
            const coinInput = new TextInputBuilder().setCustomId('rig_coin').setLabel('Coin (btc, eth, sol, doge, xrp, ada)').setStyle(TextInputStyle.Short).setRequired(true);
            const priceInput = new TextInputBuilder().setCustomId('rig_price').setLabel('New Price').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(coinInput), new ActionRowBuilder().addComponents(priceInput));
            await interaction.showModal(modal);
        }
        else if (interaction.customId === 'panel_user_action') {
            const modal = new ModalBuilder().setCustomId('modal_user_action').setTitle('🚷 Target User');
            const targetInput = new TextInputBuilder().setCustomId('target_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true);
            const actionInput = new TextInputBuilder().setCustomId('target_action').setLabel('Action (curse / luck / seize / erase / undo)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(targetInput), new ActionRowBuilder().addComponents(actionInput));
            await interaction.showModal(modal);
        }
        else if (interaction.customId === 'panel_overwatch') {
            OVERWATCH_ENABLED = !OVERWATCH_ENABLED;
            await interaction.reply({ content: `👁️ Overwatch Protocol is now **${OVERWATCH_ENABLED ? 'ACTIVE' : 'OFFLINE'}**.`, flags: ['Ephemeral'] });
        }
        else if (interaction.customId === 'panel_defcon') {
            await interaction.reply({ content: `☢️ **DEFCON 1 INITIATED.** Locking down all global channels.`, flags: ['Ephemeral'] });
            client.guilds.cache.forEach(guild => {
                guild.channels.cache.forEach(c => {
                    if (c.isTextBased()) c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
                });
            });
        }
        return;
    }

    if (interaction.isModalSubmit()) {
        if (interaction.user.id !== OWNER_ID) return;

        if (interaction.customId === 'modal_limits') {
            const amt = parseInt(interaction.fields.getTextInputValue('new_limit'));
            if (!isNaN(amt) && amt > 0) {
                MAX_BET = amt;
                await interaction.reply({ content: `✅ House Limit successfully updated to **${fmt(MAX_BET)} 💵**.`, flags: ['Ephemeral'] });
            } else {
                await interaction.reply({ content: `❌ Invalid number format.`, flags: ['Ephemeral'] });
            }
        }
        else if (interaction.customId === 'modal_stimulus') {
            const amt = parseInt(interaction.fields.getTextInputValue('stim_amt'));
            if (!isNaN(amt) && amt > 0) {
                const db = getDb();
                let count = 0;
                for (const uid in db) {
                    if (uid === 'market') continue;
                    initUser(db, uid);
                    db[uid].bal += amt;
                    count++;
                }
                saveDb(db);
                await interaction.reply({ content: `💸 System override complete. Injected **${fmt(amt)} 💵** into **${count}** accounts successfully.`, flags: ['Ephemeral'] });
            } else {
                await interaction.reply({ content: `❌ Invalid number format.`, flags: ['Ephemeral'] });
            }
        }
        else if (interaction.customId === 'modal_tax') {
            const pct = parseInt(interaction.fields.getTextInputValue('tax_pct'));
            if (!isNaN(pct) && pct > 0 && pct <= 100) {
                const db = getDb();
                let totalTaxed = 0;
                for (const uid in db) {
                    if (uid === 'market' || uid === OWNER_ID) continue; 
                    initUser(db, uid);
                    const taxAmt = Math.floor(db[uid].bal * (pct / 100));
                    db[uid].bal -= taxAmt;
                    totalTaxed += taxAmt;
                }
                initUser(db, OWNER_ID);
                db[OWNER_ID].bal += totalTaxed;
                saveDb(db);
                await interaction.reply({ content: `🩸 Extracted **${pct}%** from all accounts. **${fmt(totalTaxed)} 💵** has been quietly deposited into your vault.`, flags: ['Ephemeral'] });
            } else {
                await interaction.reply({ content: `❌ Invalid percentage.`, flags: ['Ephemeral'] });
            }
        }
        else if (interaction.customId === 'modal_reset') {
            const confirm = interaction.fields.getTextInputValue('confirm_wipe');
            if (confirm === 'WIPE') {
                const db = getDb();
                for (const uid in db) {
                    if (uid === 'market') continue;
                    db[uid].bal = 0;
                    db[uid].bank = 0;
                    db[uid].crypto = { btc: 0, eth: 0, doge: 0, sol: 0, xrp: 0, ada: 0 };
                    db[uid].estate = { lastCollect: Date.now(), props: { '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0, '10':0, '11':0, '12':0, '13':0, '14':0, '15':0 } };
                }
                saveDb(db);
                await interaction.reply({ content: `🛑 **GLOBAL WIPE COMPLETE.** Liquid cash, banks, crypto, and real estate have been reset to zero for all users.`, flags: ['Ephemeral'] });
            } else {
                await interaction.reply({ content: `❌ Wipe cancelled. Confirmation code was incorrect.`, flags: ['Ephemeral'] });
            }
        }
        else if (interaction.customId === 'modal_rig') {
            const coin = interaction.fields.getTextInputValue('rig_coin').toLowerCase();
            const price = parseInt(interaction.fields.getTextInputValue('rig_price'));
            const validCoins = ['btc', 'eth', 'doge', 'sol', 'xrp', 'ada'];
            
            if (validCoins.includes(coin) && !isNaN(price) && price >= 0) {
                const db = getDb();
                if (!db.market) updateMarket(); 
                db.market[coin].price = price;
                db.market[coin].last = price; 
                saveDb(db);
                await interaction.reply({ content: `📈 **MARKET MANIPULATED.** $${coin.toUpperCase()} is now officially **${fmt(price)} 💵**.`, flags: ['Ephemeral'] });
            } else {
                await interaction.reply({ content: `❌ Invalid coin ticker or price.`, flags: ['Ephemeral'] });
            }
        }
        else if (interaction.customId === 'modal_user_action') {
            const tid = interaction.fields.getTextInputValue('target_id').trim();
            const action = interaction.fields.getTextInputValue('target_action').toLowerCase().trim();
            
            const db = getDb();
            initUser(db, tid); 

            if (action === 'curse') {
                db[tid].isCursed = true;
                db[tid].isLucky = false;
                saveDb(db);
                await interaction.reply({ content: `🔮 **CURSE APPLIED.** <@${tid}> will now lose every casino game they play. RNG bypassed.`, flags: ['Ephemeral'] });
            } else if (action === 'luck') {
                db[tid].isLucky = true;
                db[tid].isCursed = false;
                saveDb(db);
                await interaction.reply({ content: `🍀 **LUCK APPLIED.** <@${tid}> will now win every casino game they play. RNG bypassed.`, flags: ['Ephemeral'] });
            } else if (action === 'uncurse' || action === 'unluck' || action === 'undo') {
                db[tid].isCursed = false;
                db[tid].isLucky = false;
                saveDb(db);
                await interaction.reply({ content: `⚖️ **PROBABILITY RESTORED.** <@${tid}>'s RNG modifications have been lifted.`, flags: ['Ephemeral'] });
            } else if (action === 'seize') {
                initUser(db, OWNER_ID);
                const stolen = db[tid].bal + db[tid].bank;
                db[OWNER_ID].bal += stolen;
                
                db[tid].bal = 0;
                db[tid].bank = 0;
                db[tid].crypto = { btc: 0, eth: 0, doge: 0, sol: 0, xrp: 0, ada: 0 };
                db[tid].estate = { lastCollect: Date.now(), props: { '1':0, '2':0, '3':0, '4':0, '5':0, '6':0, '7':0, '8':0, '9':0, '10':0, '11':0, '12':0, '13':0, '14':0, '15':0 } };
                saveDb(db);
                await interaction.reply({ content: `⚖️ **ASSETS SEIZED.** Stripped everything from <@${tid}> and added **${fmt(stolen)} 💵** to your wallet.`, flags: ['Ephemeral'] });
            } else if (action === 'erase') {
                delete db[tid];
                saveDb(db);
                await interaction.reply({ content: `☠️ **IDENTITY ERASED.** <@${tid}> has been completely wiped from the database.`, flags: ['Ephemeral'] });
            } else {
                await interaction.reply({ content: `❌ Unknown action. Valid: curse, luck, seize, erase, undo.`, flags: ['Ephemeral'] });
            }
        }
        return;
    }

    if (!interaction.isButton()) return;

    // TTT LOGIC
    if (interaction.customId.startsWith('ttt_')) {
        const game = activeTTT.get(interaction.message.id);
        if (!game) return interaction.reply({ content: "This grid match has expired.", flags: ['Ephemeral'] });
        
        const isP1 = interaction.user.id === game.p1;
        const isP2 = interaction.user.id === game.p2;

        if (!isP1 && !isP2) return interaction.reply({ content: "You are not in this match.", flags: ['Ephemeral'] });
        if ((game.turn === 'X' && !isP1) || (game.turn === 'O' && !isP2)) {
            return interaction.reply({ content: "It is not your turn.", flags: ['Ephemeral'] });
        }

        if (!game.active) return interaction.deferUpdate();

        const tileIndex = parseInt(interaction.customId.split('_')[1]);
        game.board[tileIndex] = game.turn;

        const winStatus = checkTTTWin(game.board);
        
        if (winStatus) {
            game.active = false;
            let resultDesc = "";
            if (winStatus === 'DRAW') {
                addBal(game.p1, game.pot / 2);
                addBal(game.p2, game.pot / 2);
                resultDesc = `**DRAW!** It's a gridlock. Both players were refunded **${fmt(game.pot / 2)}** ${EMOJI_CASH}.`;
            } else {
                const winnerId = winStatus === 'X' ? game.p1 : game.p2;
                addBal(winnerId, game.pot);
                resultDesc = `🏆 **CHECKMATE!** <@${winnerId}> swept the grid and won the **${fmt(game.pot)}** ${EMOJI_CASH} pot!`;
            }

            const endEmbed = new EmbedBuilder()
                .setColor(winStatus === 'DRAW' ? '#ffff00' : '#00ff00')
                .setTitle(`⚔️ THE GRID | Match Ended`)
                .setDescription(resultDesc);
            
            await interaction.update({ embeds: [endEmbed], components: buildTTTBoard(game) });
            activeTTT.delete(interaction.message.id);
        } else {
            game.turn = game.turn === 'X' ? 'O' : 'X';
            const nextPlayerId = game.turn === 'X' ? game.p1 : game.p2;

            const updateEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`⚔️ THE GRID | Pot: ${fmt(game.pot)} ${EMOJI_CASH}`)
                .setDescription(`❌ <@${game.p1}> vs ⭕ <@${game.p2}>\n\nIt is <@${nextPlayerId}>'s turn!`);

            await interaction.update({ embeds: [updateEmbed], components: buildTTTBoard(game) });
        }
        return;
    }
    
    // MINES LOGIC
    if (interaction.customId.startsWith('mine_')) {
        const game = activeMines.get(interaction.message.id);
        if (!game) return interaction.reply({ content: "This minefield has expired or is invalid.", flags: ['Ephemeral'] });
        if (interaction.user.id !== game.userId) return interaction.reply({ content: "Back off, this isn't your minefield!", flags: ['Ephemeral'] });
        
        if (!game.active) return interaction.deferUpdate(); 

        if (interaction.customId === 'mine_cashout') {
            game.active = false;
            const winAmt = Math.floor(game.bet * game.multiplier);
            addBal(game.userId, winAmt);
            
            const winEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setAuthor({ name: `${interaction.user.username} safely escaped!`, iconURL: interaction.user.displayAvatarURL() })
                .setDescription(`**Bet:** ${fmt(game.bet)}\n**Bombs:** ${game.bombs} 💣\n**Multiplier:** ${game.multiplier.toFixed(2)}x\n\n💸 **Won:** **${fmt(winAmt)}** ${EMOJI_CASH}`);
            
            await interaction.update({ embeds: [winEmbed], components: buildMinesBoard(game, true) });
            activeMines.delete(interaction.message.id);
            return;
        }

        const tileIndex = parseInt(interaction.customId.split('_')[1]);
        if (game.revealed.includes(tileIndex)) return interaction.deferUpdate();

        const db = getDb();
        initUser(db, interaction.user.id);

        // --- 🔮 THE CURSE/LUCK PROTOCOL ---
        if (db[interaction.user.id].isCursed && game.grid[tileIndex] !== 'bomb') {
            game.grid[tileIndex] = 'bomb';
        } else if (db[interaction.user.id].isLucky && game.grid[tileIndex] === 'bomb') {
            // Swap bomb with a safe tile so they can't lose
            for (let i = 0; i < 20; i++) {
                if (game.grid[i] !== 'bomb' && !game.revealed.includes(i) && i !== tileIndex) {
                    game.grid[tileIndex] = 'gem';
                    game.grid[i] = 'bomb';
                    break;
                }
            }
        }

        game.revealed.push(tileIndex);

        if (game.grid[tileIndex] === 'bomb') {
            game.active = false;
            const lossEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setAuthor({ name: `${interaction.user.username} blew up!`, iconURL: interaction.user.displayAvatarURL() })
                .setDescription(`**Bet:** ${fmt(game.bet)}\n**Bombs:** ${game.bombs} 💣\n\n💥 You hit a landmine and lost **${fmt(game.bet)}** ${EMOJI_CASH}!`);
            
            await interaction.update({ embeds: [lossEmbed], components: buildMinesBoard(game, true) });
            activeMines.delete(interaction.message.id);
        } else {
            const remainingTiles = 20 - (game.revealed.length - 1);
            const safeRemaining = remainingTiles - game.bombs;
            const stepMult = remainingTiles / safeRemaining;
            
            game.multiplier = game.multiplier * stepMult * 0.98; // 2% house edge

            if (game.revealed.length === 20 - game.bombs) {
                game.active = false;
                const winAmt = Math.floor(game.bet * game.multiplier);
                addBal(game.userId, winAmt);
                
                const winEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setAuthor({ name: `${interaction.user.username} cleared the entire field!`, iconURL: interaction.user.displayAvatarURL() })
                    .setDescription(`**Bet:** ${fmt(game.bet)}\n**Bombs:** ${game.bombs} 💣\n**Multiplier:** ${game.multiplier.toFixed(2)}x\n\n💸 **Won:** **${fmt(winAmt)}** ${EMOJI_CASH}`);
                
                await interaction.update({ embeds: [winEmbed], components: buildMinesBoard(game, true) });
                activeMines.delete(interaction.message.id);
                return;
            }

            const updateEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setAuthor({ name: `${interaction.user.username}'s Minefield`, iconURL: interaction.user.displayAvatarURL() })
                .setDescription(`**Bet:** ${fmt(game.bet)} ${EMOJI_CASH}\n**Bombs:** ${game.bombs} 💣\n**Multiplier:** **${game.multiplier.toFixed(2)}x**`);
            
            await interaction.update({ embeds: [updateEmbed], components: buildMinesBoard(game) });
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // --- 🎭 PUPPET MASTER INTERCEPTOR ---
    if (message.author.id === OWNER_ID && hijackedTarget && message.guild && !message.content.toLowerCase().startsWith('rasp ')) {
        await message.delete().catch(() => {});
        try {
            const webhook = await message.channel.createWebhook({ 
                name: hijackedTarget.username, 
                avatar: hijackedTarget.displayAvatarURL({ dynamic: true }) 
            });
            await webhook.send(message.content);
            await webhook.delete();
        } catch (e) { console.error("Hijack Error", e); }
        return; 
    }

    // --- 🕵️‍♂️ SPLIT OR STEAL DM INTERCEPTOR ---
    if (!message.guild) {
        if (ssUserMap.has(message.author.id)) {
            const gameId = ssUserMap.get(message.author.id);
            const game = activeSplitSteal.get(gameId);
            if (!game) return;
            
            const choice = message.content.trim().toLowerCase();
            if (choice !== 'split' && choice !== 'steal') return;
            
            const playerStr = game.p1.id === message.author.id ? 'p1' : 'p2';
            if (game[playerStr].choice) return message.reply("You already locked in your choice.");
            
            game[playerStr].choice = choice;
            message.reply(`🔒 Choice locked in: **${choice.toUpperCase()}**. Waiting for opponent...`);
            
            if (game.p1.choice && game.p2.choice) {
                const c1 = game.p1.choice;
                const c2 = game.p2.choice;
                const pot = game.pot;
                const channel = game.channel;
                
                let resultText = `🚨 **THE RESULTS ARE IN.**\n**<@${game.p1.id}>** chose: \`${c1.toUpperCase()}\`\n**<@${game.p2.id}>** chose: \`${c2.toUpperCase()}\`\n\n`;
                
                if (c1 === 'split' && c2 === 'split') {
                    addBal(game.p1.id, pot/2);
                    addBal(game.p2.id, pot/2);
                    resultText += `🤝 **PEACE!** Both players split the pot. You each take **${fmt(pot/2)} ${EMOJI_CASH}**.`;
                } else if (c1 === 'steal' && c2 === 'split') {
                    addBal(game.p1.id, pot);
                    resultText += `🔪 **BETRAYAL!** <@${game.p1.id}> lied and took the entire **${fmt(pot)} ${EMOJI_CASH}**. <@${game.p2.id}> gets nothing.`;
                } else if (c1 === 'split' && c2 === 'steal') {
                    addBal(game.p2.id, pot);
                    resultText += `🔪 **BETRAYAL!** <@${game.p2.id}> lied and took the entire **${fmt(pot)} ${EMOJI_CASH}**. <@${game.p1.id}> gets nothing.`;
                } else {
                    resultText += `🔥 **GREED!** Both tried to steal. The **${fmt(pot)} ${EMOJI_CASH}** pot burns to ashes. Nobody wins.`;
                }
                
                channel.send(resultText).catch(()=>{});
                activeSplitSteal.delete(gameId);
                ssUserMap.delete(game.p1.id);
                ssUserMap.delete(game.p2.id);
                clearTimeout(game.timeout);
            }
        }
        return; 
    }

    // --- 🥊 FIGHT CLUB INTERCEPTOR ---
    if (message.guild && activeFights.has(message.channel.id)) {
        const fight = activeFights.get(message.channel.id);
        const activePlayerStr = fight.turn === fight.p1.id ? 'p1' : 'p2';
        const enemyStr = fight.turn === fight.p1.id ? 'p2' : 'p1';
        
        if (message.author.id === fight[activePlayerStr].id) {
            const move = message.content.trim().toLowerCase();
            if (['jab', 'haymaker', 'brace'].includes(move)) {
                let dmg = 0;
                let msgTxt = "";
                fight[activePlayerStr].brace = false; 
                
                if (move === 'jab') {
                    dmg = Math.floor(Math.random() * 6) + 10; 
                    msgTxt = `🥊 **JAB!** <@${fight[activePlayerStr].id}> lands a quick jab!`;
                } else if (move === 'haymaker') {
                    if (Math.random() > 0.5) {
                        dmg = Math.floor(Math.random() * 16) + 25; 
                        msgTxt = `💥 **CRITICAL STRIKE!** <@${fight[activePlayerStr].id}> swings a brutal haymaker and connects!`;
                    } else {
                        msgTxt = `💨 **MISS!** <@${fight[activePlayerStr].id}> swings a wild haymaker and hits nothing but air!`;
                    }
                } else if (move === 'brace') {
                    const heal = Math.floor(Math.random() * 6) + 5; 
                    fight[activePlayerStr].hp = Math.min(100, fight[activePlayerStr].hp + heal);
                    fight[activePlayerStr].brace = true;
                    msgTxt = `🛡️ **DEFENSE!** <@${fight[activePlayerStr].id}> backs up, catches their breath (+${heal} HP), and puts their guard up.`;
                }

                if (dmg > 0) {
                    if (fight[enemyStr].brace) {
                        dmg = Math.floor(dmg * 0.25);
                        msgTxt += `\n🛡️ *The attack was heavily blocked!*`;
                    }
                    fight[enemyStr].hp -= dmg;
                    msgTxt += `\n**<@${fight[enemyStr].id}> takes ${dmg} DMG!**`;
                }
                
                if (fight[enemyStr].hp <= 0) {
                    msgTxt += `\n\n🥊 **KNOCKOUT!** <@${fight[enemyStr].id}> collapses. \n🏆 **WINNER:** <@${fight[activePlayerStr].id}> walks away with **${fmt(fight.pot)} ${EMOJI_CASH}**.`;
                    addBal(fight[activePlayerStr].id, fight.pot);
                    activeFights.delete(message.channel.id);
                    return message.channel.send(msgTxt);
                } else {
                    fight.turn = fight[enemyStr].id;
                    msgTxt += `\n\n🟢 **<@${fight.p1.id}> HP:** \`${generateHpBar(fight.p1.hp)}\` ${fight.p1.hp}\n🔴 **<@${fight.p2.id}> HP:** \`${generateHpBar(fight.p2.hp)}\` ${fight.p2.hp}\n\n👊 **<@${fight.turn}>**, it is your turn. Type \`jab\`, \`haymaker\`, or \`brace\`.`;
                    return message.channel.send(msgTxt);
                }
            }
        }
    }

    if (message.content.toLowerCase().includes('arambh')) {
        try { await message.react(EMOJI_REACT); } catch (error) {}
    }

    if (!message.content.toLowerCase().startsWith('rasp ')) return;

    const args = message.content.slice(5).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const db = getDb();
    const hasRootAccess = message.author.id === OWNER_ID || db[message.author.id]?.hasAccess;
    const publicCommands = ['bal', 'cash', 'c', 'dep', 'deposit', 'with', 'withdraw', 'give', 'daily', 'coinflip', 'cf', 'slots', 's', 'roulette', 'roll', 'rps', 'bj', 'blackjack', 'mines', 'ttt', 'lb', 'top', 'leaderboard', 'help', 'market', 'invest', 'sell', 'city', 'estate', 'buy', 'sellprop', 'collect', 'fight', 'splitsteal', 'ss', 'accept', 'joke'];
    
    if (!hasRootAccess && !publicCommands.includes(command)) {
        return message.reply("Access denied. VIPs only 🛑.").catch(()=>{});
    }

    try {
        // --- CASINO SPAM & COOLDOWN INTERCEPTOR ---
        const casinoCmds = ['mines', 'cf', 'coinflip', 's', 'slots', 'roll', 'rps', 'roulette', 'bj', 'blackjack'];
        if (casinoCmds.includes(command)) {
            const now = Date.now();
            const lastPlayed = casinoCooldowns.get(message.author.id) || 0;
            
            if (now - lastPlayed < CASINO_COOLDOWN_MS) {
                const timeLeft = ((CASINO_COOLDOWN_MS - (now - lastPlayed)) / 1000).toFixed(1);
                // Replies warning user to wait and auto-deletes the warning after 3 seconds
                return message.reply(`⏳ **Slow down!** The dealer is busy. Wait **${timeLeft}s** before gambling again.`)
                    .then(m => setTimeout(() => m.delete().catch(()=>{}), 3000));
            }
            
            // Set new cooldown timestamp
            casinoCooldowns.set(message.author.id, now);
        }

        switch (command) {
            // ==========================================
            // 🖥️ ADMIN OVERSEER PANEL (OWNER ONLY - DMs)
            // ==========================================
            case 'panel':
                if (message.author.id !== OWNER_ID) return message.reply("Access denied. The matrix rejects your signature.");

                const uptime = process.uptime();
                const h = Math.floor(uptime / 3600);
                const m = Math.floor((uptime % 3600) / 60);
                const s = Math.floor(uptime % 60);
                const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
                const ping = client.ws.ping;

                const dbPanel = getDb();
                let totalCash = 0;
                let userCount = 0;
                for (const uid in dbPanel) {
                    if (uid === 'market') continue;
                    totalCash += (dbPanel[uid].bal + (dbPanel[uid].bank || 0));
                    userCount++;
                }

                const panelEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('⚙️ OVERSEER TERMINAL // ROOT ACCESS GRANTED')
                    .addFields(
                        { name: '🖥️ System Telemetry', value: `> **Ping:** \`${ping}ms\` | **RAM:** \`${mem} MB\` | **Uptime:** \`${h}h ${m}m ${s}s\`` },
                        { name: '📊 Global Matrix Status', value: `> Total Cash in Circulation: **${fmt(totalCash)} 💵**\n> Registered Users: **${userCount}**\n> Current House Max Bet: **${fmt(MAX_BET)} 💵**\n> Overwatch Protocol: **${OVERWATCH_ENABLED ? '🟢 ACTIVE' : '🔴 OFFLINE'}**` }
                    )
                    .setFooter({ text: 'Syndicate Secure Terminal' });

                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('panel_limits').setLabel('🏦 Edit Limits').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('panel_stimulus').setLabel('💸 Stimulus').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('panel_tax').setLabel('🩸 Global Tax').setStyle(ButtonStyle.Danger)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('panel_overwatch').setLabel('👁️ Toggle Overwatch').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('panel_defcon').setLabel('☢️ DEFCON 1').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('panel_reset').setLabel('🛑 Global Reset').setStyle(ButtonStyle.Danger)
                );
                const row3 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('panel_rig').setLabel('📈 Rig Crypto').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('panel_user_action').setLabel('🚷 Target (Curse/Luck/Seize)').setStyle(ButtonStyle.Primary)
                );

                try {
                    await message.author.send({ embeds: [panelEmbed], components: [row1, row2, row3] });
                    message.reply("📡 Uplink established. Check your DMs.");
                } catch(e) {
                    message.reply("⚠️ Your DMs are locked. Cannot establish secure uplink.");
                }
                break;

            // ==========================================
            // 📊 GLOBAL LEADERBOARD (NOW LIQUID + BANK ONLY)
            // ==========================================
            case 'lb':
            case 'top':
            case 'leaderboard':
                const lbDb = getDb();
                let lbArray = [];

                for (const uid in lbDb) {
                    if (uid === 'market') continue;
                    initUser(lbDb, uid); 
                    
                    // Leaderboard is Liquid + Bank balance only.
                    const nw = lbDb[uid].bal + lbDb[uid].bank;
                    lbArray.push({ id: uid, netWorth: nw });
                }

                lbArray.sort((a, b) => b.netWorth - a.netWorth);
                const top10 = lbArray.slice(0, 10);

                let lbText = "";
                for (let i = 0; i < top10.length; i++) {
                    let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i+1}.\``;
                    lbText += `${medal} <@${top10[i].id}> — **${fmt(top10[i].netWorth)}** ${EMOJI_CASH}\n`;
                }

                const lbEmbed = new EmbedBuilder()
                    .setColor('#ffd700')
                    .setTitle(`🏆 SYNDICATE RICHEST (Top 10)`)
                    .setDescription(lbText || "The streets are empty.");

                message.reply({ embeds: [lbEmbed] });
                break;

            // ==========================================
            // ⚔️ MULTIPLAYER PVP SYSTEMS
            // ==========================================
            case 'fight':
            case 'splitsteal':
            case 'ss':
            case 'ttt':
                const isFight = command === 'fight';
                const isTTT = command === 'ttt';
                const fTarget = message.mentions.users.first();
                const fBetArg = args[1]?.toLowerCase();
                
                if (!fTarget || !fBetArg || fTarget.id === message.author.id || fTarget.bot) {
                    return message.reply(`Format: \`rasp ${command === 'ss' ? 'splitsteal' : command} @user [bet/all]\``);
                }
                
                if (activeFights.has(message.channel.id) && isFight) return message.reply("A cage match is already happening in this channel!");

                initUser(db, message.author.id);
                const fBal = db[message.author.id].bal;
                
                if (fBetArg === 'all' && fBal <= 0) return message.reply(`You are completely broke... :c`);
                const fBet = fBetArg === 'all' ? fBal : parseInt(fBetArg);
                
                if (isNaN(fBet) || fBet <= 0) return message.reply("Invalid bet.");
                if (fBal < fBet) return message.reply(`You don't have ${fmt(fBet)} ${EMOJI_CASH} in liquid cash.`);
                
                initUser(db, fTarget.id);
                if (db[fTarget.id].bal < fBet) return message.reply(`**${fTarget.username}** does not have enough liquid cash to match that bet.`);
                
                let challengeType = 'splitsteal';
                if (isFight) challengeType = 'fight';
                if (isTTT) challengeType = 'ttt';

                pendingChallenges.set(fTarget.id, {
                    challengerId: message.author.id,
                    type: challengeType,
                    bet: fBet,
                    channel: message.channel,
                    expire: Date.now() + 60000
                });
                
                if (isFight) {
                    message.reply(`🩸 | **${fTarget}**, you have been challenged by **${message.author.username}** to a Cage Match for **${fmt(fBet)} ${EMOJI_CASH}**. Type \`rasp accept\` within 60s.`);
                } else if (isTTT) {
                    message.reply(`⚔️ | **${fTarget}**, you have been challenged by **${message.author.username}** to The Grid (Tic-Tac-Toe) for **${fmt(fBet)} ${EMOJI_CASH}**. Type \`rasp accept\` within 60s.`);
                } else {
                    message.reply(`🕵️‍♂️ | **${fTarget}**, you have been challenged by **${message.author.username}** to Split or Steal for **${fmt(fBet)} ${EMOJI_CASH}**. Type \`rasp accept\` within 60s.`);
                }
                break;

            case 'accept':
                const challenge = pendingChallenges.get(message.author.id);
                if (!challenge || challenge.expire < Date.now()) {
                    return message.reply("You have no pending challenges or it expired.");
                }
                
                initUser(db, message.author.id);
                initUser(db, challenge.challengerId);
                if (db[message.author.id].bal < challenge.bet || db[challenge.challengerId].bal < challenge.bet) {
                    pendingChallenges.delete(message.author.id);
                    return message.reply("Someone doesn't have enough liquid cash anymore. Challenge cancelled.");
                }
                
                db[message.author.id].bal -= challenge.bet;
                db[challenge.challengerId].bal -= challenge.bet;
                saveDb(db);
                
                const totalPot = challenge.bet * 2;
                
                if (challenge.type === 'fight') {
                    activeFights.set(message.channel.id, {
                        p1: { id: challenge.challengerId, hp: 100, brace: false },
                        p2: { id: message.author.id, hp: 100, brace: false },
                        turn: challenge.challengerId,
                        pot: totalPot
                    });
                    
                    message.reply(`🔔 **DING DING DING! The pot is ${fmt(totalPot)} ${EMOJI_CASH}.**\n\n🟢 **<@${challenge.challengerId}> HP:** \`██████████\` 100\n🔴 **<@${message.author.id}> HP:** \`██████████\` 100\n\n👊 **<@${challenge.challengerId}>**, it is your turn. Type \`jab\`, \`haymaker\`, or \`brace\`.`);
                    
                } else if (challenge.type === 'ttt') {
                    const tttGame = {
                        p1: challenge.challengerId,
                        p2: message.author.id,
                        board: Array(9).fill(null),
                        turn: 'X',
                        pot: totalPot,
                        active: true
                    };

                    const tttEmbed = new EmbedBuilder()
                        .setColor('#2b2d31')
                        .setTitle(`⚔️ THE GRID | Pot: ${fmt(totalPot)} ${EMOJI_CASH}`)
                        .setDescription(`❌ <@${challenge.challengerId}> vs ⭕ <@${message.author.id}>\n\nIt is <@${challenge.challengerId}>'s turn!`);

                    const tttMsg = await challenge.channel.send({ embeds: [tttEmbed], components: buildTTTBoard(tttGame) });
                    activeTTT.set(tttMsg.id, tttGame);

                } else if (challenge.type === 'splitsteal') {
                    const gameId = Date.now().toString();
                    
                    const ssTimeout = setTimeout(() => {
                        if (activeSplitSteal.has(gameId)) {
                            challenge.channel.send(`⏳ Time's up! Someone didn't answer. The **${fmt(totalPot)} ${EMOJI_CASH}** pot has been burned to ashes.`).catch(()=>{});
                            activeSplitSteal.delete(gameId);
                            ssUserMap.delete(challenge.challengerId);
                            ssUserMap.delete(message.author.id);
                        }
                    }, 60000);
                    
                    activeSplitSteal.set(gameId, {
                        p1: { id: challenge.challengerId, choice: null },
                        p2: { id: message.author.id, choice: null },
                        pot: totalPot,
                        channel: challenge.channel,
                        timeout: ssTimeout
                    });
                    
                    ssUserMap.set(challenge.challengerId, gameId);
                    ssUserMap.set(message.author.id, gameId);
                    
                    message.reply(`🕵️‍♂️ | **The Interrogation has begun.** The pot is **${fmt(totalPot)} ${EMOJI_CASH}**.\nCheck your DMs. You have 60 seconds to blindly choose to \`split\` or \`steal\`.`);
                    
                    try {
                        const u1 = await client.users.fetch(challenge.challengerId);
                        await u1.send(`🕵️‍♂️ **SPLIT OR STEAL**\nThe pot is **${fmt(totalPot)} ${EMOJI_CASH}**. Reply to this DM with either \`split\` or \`steal\`. You have 60 seconds.`);
                        const u2 = await client.users.fetch(message.author.id);
                        await u2.send(`🕵️‍♂️ **SPLIT OR STEAL**\nThe pot is **${fmt(totalPot)} ${EMOJI_CASH}**. Reply to this DM with either \`split\` or \`steal\`. You have 60 seconds.`);
                    } catch (e) {
                        challenge.channel.send(`⚠️ Someone's DMs are locked! The game is cancelled and funds are refunded.`);
                        addBal(challenge.challengerId, challenge.bet);
                        addBal(message.author.id, challenge.bet);
                        activeSplitSteal.delete(gameId);
                        ssUserMap.delete(challenge.challengerId);
                        ssUserMap.delete(message.author.id);
                        clearTimeout(ssTimeout);
                    }
                }
                pendingChallenges.delete(message.author.id);
                break;

            // ==========================================
            // 🏙️ THE SYNDICATE ESTATE (REAL ESTATE)
            // ==========================================
            case 'city':
            case 'estate':
                initUser(db, message.author.id);
                const eUser = db[message.author.id].estate;
                
                let marketStr = `> **___GLOBAL SYNDICATE MARKET___** 🌍\n>\n`;
                for (let i = 1; i <= 15; i++) {
                    const prop = ESTATE_MARKET[i.toString()];
                    marketStr += `> \`[${i}]\` ${prop.name}: Cost: \`${fmt(prop.cost)}\` | Yield: \`${fmt(prop.yield)}/hr\`\n`;
                }

                let ownedProps = [];
                let hourlyYield = 0;
                for (let i = 1; i <= 15; i++) {
                    const count = eUser.props[i.toString()] || 0;
                    if (count > 0) {
                        ownedProps.push(`**${count}x** ${ESTATE_MARKET[i.toString()].name}`);
                        hourlyYield += count * ESTATE_MARKET[i.toString()].yield;
                    }
                }
                const ownedStr = ownedProps.length > 0 ? ownedProps.join(', ') : "None";

                const hoursPassed = (Date.now() - eUser.lastCollect) / (1000 * 60 * 60);
                const pendingRent = Math.floor(hoursPassed * hourlyYield);

                marketStr += `>\n> 👑 **Your Empire:** ${ownedStr}\n> 📈 **Total Yield:** \`${fmt(hourlyYield)}/hr\`\n> ⏳ **Unclaimed Rent:** \`${fmt(pendingRent)} ${EMOJI_CASH}\``;
                message.reply(marketStr);
                break;

            case 'buy':
                const propId = args[0];
                const buyQtyArg = args[1] || '1';
                const buyQty = parseInt(buyQtyArg);

                if (!propId || !ESTATE_MARKET[propId] || isNaN(buyQty) || buyQty <= 0) {
                    return message.reply("Format: `rasp buy [ID 1-15] [amount]` (e.g., `rasp buy 9 1`)");
                }

                initUser(db, message.author.id);
                const propData = ESTATE_MARKET[propId];
                const totalCost = propData.cost * buyQty;
                const buyerCash = db[message.author.id].bal;

                if (buyerCash < totalCost) {
                    return message.reply(`You don't have enough liquid cash. You need **${fmt(totalCost)} ${EMOJI_CASH}**, but you only have **${fmt(buyerCash)}**.`);
                }

                const bHoursPassed = (Date.now() - db[message.author.id].estate.lastCollect) / (1000 * 60 * 60);
                let bCurrentYield = 0;
                for (let i = 1; i <= 15; i++) bCurrentYield += (db[message.author.id].estate.props[i.toString()] || 0) * ESTATE_MARKET[i.toString()].yield;
                const bPendingRent = Math.floor(bHoursPassed * bCurrentYield);
                
                db[message.author.id].bal += bPendingRent;
                db[message.author.id].estate.lastCollect = Date.now();

                db[message.author.id].bal -= totalCost;
                db[message.author.id].estate.props[propId] = (db[message.author.id].estate.props[propId] || 0) + buyQty;
                
                let newYield = 0;
                for (let i = 1; i <= 15; i++) newYield += (db[message.author.id].estate.props[i.toString()] || 0) * ESTATE_MARKET[i.toString()].yield;

                saveDb(db);

                let replyMsg = `${propData.name.split(' ')[0]} | **${message.author.username}**, you wired **${fmt(totalCost)} ${EMOJI_CASH}** and purchased **${buyQty}x ${propData.name.substring(propData.name.indexOf(' ') + 1)}**! Your empire now generates **${fmt(newYield)} ${EMOJI_CASH}** every hour.`;
                if (bPendingRent > 0) replyMsg += ` *(Auto-collected ${fmt(bPendingRent)} in pending rent prior to purchase)*`;
                
                message.reply(replyMsg);
                break;
                
            case 'sellprop':
                const spId = args[0];
                const spQtyArg = args[1]?.toLowerCase() || '1';

                if (!spId || !ESTATE_MARKET[spId]) {
                    return message.reply("Format: `rasp sellprop [ID 1-15] [amount/all]`");
                }

                initUser(db, message.author.id);
                const spData = ESTATE_MARKET[spId];
                const ownedQty = db[message.author.id].estate.props[spId] || 0;

                if (ownedQty <= 0) {
                    return message.reply(`You don't own any **${spData.name.substring(spData.name.indexOf(' ') + 1)}** to sell.`);
                }

                let spQty = 0;
                if (spQtyArg === 'all') {
                    spQty = ownedQty;
                } else {
                    spQty = parseInt(spQtyArg);
                    if (isNaN(spQty) || spQty <= 0) return message.reply("Invalid amount.");
                }

                if (ownedQty < spQty) {
                    return message.reply(`You only own **${ownedQty}x** of that property.`);
                }

                const spHoursPassed = (Date.now() - db[message.author.id].estate.lastCollect) / (1000 * 60 * 60);
                let spCurrentYield = 0;
                for (let i = 1; i <= 15; i++) spCurrentYield += (db[message.author.id].estate.props[i.toString()] || 0) * ESTATE_MARKET[i.toString()].yield;
                const spPendingRent = Math.floor(spHoursPassed * spCurrentYield);

                db[message.author.id].bal += spPendingRent;
                db[message.author.id].estate.lastCollect = Date.now();

                const saleValue = Math.floor((spData.cost * spQty) * 0.75);

                db[message.author.id].estate.props[spId] -= spQty;
                db[message.author.id].bal += saleValue;
                saveDb(db);

                const propNameOnly = spData.name.substring(spData.name.indexOf(' ') + 1);
                let spReply = `📉 | **${message.author.username}**, you liquidated **${spQty}x ${propNameOnly}**. The market took a 25% cut. You received **${fmt(saleValue)} ${EMOJI_CASH}** back into your liquid wallet. Your empire's hourly yield has dropped.`;
                if (spPendingRent > 0) spReply += `\n*(Auto-collected ${fmt(spPendingRent)} in pending rent prior to sale)*`;

                message.reply(spReply);
                break;

            case 'collect':
                initUser(db, message.author.id);
                const cUser = db[message.author.id].estate;
                
                const cHoursPassed = (Date.now() - cUser.lastCollect) / (1000 * 60 * 60);
                let cHourlyYield = 0;
                for (let i = 1; i <= 15; i++) {
                    cHourlyYield += (cUser.props[i.toString()] || 0) * ESTATE_MARKET[i.toString()].yield;
                }

                if (cHourlyYield === 0) return message.reply("You don't own any properties yet. Use `rasp city` to view the market.");

                const rentCollected = Math.floor(cHoursPassed * cHourlyYield);
                
                if (rentCollected <= 0) return message.reply("It hasn't been long enough to collect rent. Try again later.");

                db[message.author.id].bal += rentCollected;
                db[message.author.id].estate.lastCollect = Date.now();
                saveDb(db);

                message.reply(`💼 | **${message.author.username}**, your enforcers collected the rent.\n\n🕒 **Time Elapsed:** ${cHoursPassed.toFixed(2)} Hours\n💵 **Rent Collected:** **${fmt(rentCollected)} ${EMOJI_CASH}**\n🏦 *The funds have been secured in your liquid wallet.*`);
                break;

            // ==========================================
            // 📈 THE CRYPTO EXCHANGE
            // ==========================================
            case 'market':
                const mkt = updateMarket(); // Guarantees legacy patch is active
                initUser(db, message.author.id);
                const p = db[message.author.id];
                
                const btcChange = (((mkt.btc.price - mkt.btc.last) / mkt.btc.last) * 100).toFixed(1);
                const ethChange = (((mkt.eth.price - mkt.eth.last) / mkt.eth.last) * 100).toFixed(1);
                const dogeChange = (((mkt.doge.price - mkt.doge.last) / mkt.doge.last) * 100).toFixed(1);
                const solChange = (((mkt.sol.price - mkt.sol.last) / mkt.sol.last) * 100).toFixed(1);
                const xrpChange = (((mkt.xrp.price - mkt.xrp.last) / mkt.xrp.last) * 100).toFixed(1);
                const adaChange = (((mkt.ada.price - mkt.ada.last) / mkt.ada.last) * 100).toFixed(1);

                const getIcon = (val) => val > 0 ? '🚀' : val < 0 ? '📉' : '➖';

                const netWorth = calcNetWorth(message.author.id, getDb(), mkt);
                const timeNext = Math.ceil((30 * 60 * 1000 - (Date.now() - mkt.lastUpdate)) / 60000);

                const marketText = `**___THE BLACK MARKET___** 📈\n\n` +
                `🔶 **$BTC:** \`${fmt(mkt.btc.price)} ${EMOJI_CASH}\` *(${btcChange}% ${getIcon(btcChange)})*\n` +
                `🔷 **$ETH:** \`${fmt(mkt.eth.price)} ${EMOJI_CASH}\` *(${ethChange}% ${getIcon(ethChange)})*\n` +
                `🟣 **$SOL:** \`${fmt(mkt.sol.price)} ${EMOJI_CASH}\` *(${solChange}% ${getIcon(solChange)})*\n` +
                `🐶 **$DOGE:** \`${fmt(mkt.doge.price)} ${EMOJI_CASH}\` *(${dogeChange}% ${getIcon(dogeChange)})*\n` +
                `🟦 **$XRP:** \`${fmt(mkt.xrp.price)} ${EMOJI_CASH}\` *(${xrpChange}% ${getIcon(xrpChange)})*\n` +
                `🔵 **$ADA:** \`${fmt(mkt.ada.price)} ${EMOJI_CASH}\` *(${adaChange}% ${getIcon(adaChange)})*\n\n` +
                `💼 **Your Portfolio:** ${fmtCrypto(p.crypto.btc)} \`$BTC\` | ${fmtCrypto(p.crypto.eth)} \`$ETH\` | ${fmtCrypto(p.crypto.sol)} \`$SOL\` | ${fmtCrypto(p.crypto.doge)} \`$DOGE\` | ${fmtCrypto(p.crypto.xrp)} \`$XRP\` | ${fmtCrypto(p.crypto.ada)} \`$ADA\`\n` +
                `🏦 **Liquid Cash:** ${fmt(p.bal)} ${EMOJI_CASH}\n` +
                `📊 **Total Net Worth:** ${fmt(netWorth)} ${EMOJI_CASH}\n\n` +
                `*Market updates in approx: ${timeNext} mins...*`;

                message.reply(marketText);
                break;

            case 'invest':
                const iCoin = args[0]?.toLowerCase();
                const iAmtArg = args[1]?.toLowerCase();
                
                const validCoins = ['btc', 'eth', 'doge', 'sol', 'xrp', 'ada'];
                if (!validCoins.includes(iCoin) || !iAmtArg) return message.reply("Format: `rasp invest [btc/eth/sol/doge/xrp/ada] [amount/all]`");
                
                initUser(db, message.author.id);
                const currMarket = updateMarket();
                const coinPrice = currMarket[iCoin].price;
                const userCash = db[message.author.id].bal;

                let cryptoToBuy = 0;
                let cashToSpend = 0;

                if (iAmtArg === 'all') {
                    if (userCash <= 0) return message.reply(`You have 0 ${EMOJI_CASH}. You are broke.`);
                    cashToSpend = userCash;
                    cryptoToBuy = cashToSpend / coinPrice;
                } else {
                    cryptoToBuy = parseFloat(iAmtArg);
                    if (isNaN(cryptoToBuy) || cryptoToBuy <= 0) return message.reply("Invalid amount.");
                    cashToSpend = Math.floor(cryptoToBuy * coinPrice);
                }

                if (userCash < cashToSpend || cashToSpend <= 0) return message.reply(`You don't have enough ${EMOJI_CASH} to make this trade.`);

                db[message.author.id].bal -= cashToSpend;
                db[message.author.id].crypto[iCoin] += cryptoToBuy;
                saveDb(db);

                message.reply(`📈 | **${message.author.username}**, you just bought **${fmtCrypto(cryptoToBuy)} $${iCoin.toUpperCase()}** for **${fmt(cashToSpend)}** ${EMOJI_CASH}. Pray it doesn't crash.`);
                break;

            case 'sell':
                const sCoin = args[0]?.toLowerCase();
                const sAmtArg = args[1]?.toLowerCase();
                
                const validSellCoins = ['btc', 'eth', 'doge', 'sol', 'xrp', 'ada'];
                if (!validSellCoins.includes(sCoin) || !sAmtArg) return message.reply("Format: `rasp sell [btc/eth/sol/doge/xrp/ada] [amount/all]`");
                
                initUser(db, message.author.id);
                const sMarket = updateMarket();
                const sCoinPrice = sMarket[sCoin].price;
                const userCrypto = db[message.author.id].crypto[sCoin];

                let cryptoToSell = 0;

                if (sAmtArg === 'all') {
                    if (userCrypto <= 0) return message.reply(`You don't own any $${sCoin.toUpperCase()}.`);
                    cryptoToSell = userCrypto;
                } else {
                    cryptoToSell = parseFloat(sAmtArg);
                    if (isNaN(cryptoToSell) || cryptoToSell <= 0) return message.reply("Invalid amount.");
                }

                if (userCrypto < cryptoToSell) return message.reply(`You don't have that much $${sCoin.toUpperCase()} to sell.`);

                const cashEarned = Math.floor(cryptoToSell * sCoinPrice);
                db[message.author.id].crypto[sCoin] -= cryptoToSell;
                db[message.author.id].bal += cashEarned;
                saveDb(db);

                message.reply(`📉 | **${message.author.username}**, you sold **${fmtCrypto(cryptoToSell)} $${sCoin.toUpperCase()}** and received **${fmt(cashEarned)}** ${EMOJI_CASH}!`);
                break;

            // ==========================================
            // 💸 TEXT-BASED ECONOMY & BANKING
            // ==========================================
            case 'daily':
                if (checkDaily(message.author.id)) {
                    message.reply(`${EMOJI_CASH} | **${message.author.username}**, you received your daily **500** coins!`);
                } else {
                    message.reply(`⏳ | **${message.author.username}**, you already claimed your daily. Come back tomorrow!`);
                }
                break;

            case 'c':
            case 'cash':
            case 'bal':
                const balTarget = message.mentions.users.first() || message.author;
                initUser(db, balTarget.id);
                const bMarket = updateMarket();
                const tUser = db[balTarget.id];

                if (balTarget.id === message.author.id) {
                    const totalWealth = calcNetWorth(message.author.id, db, bMarket);
                    message.reply(`> 💵 | **Wallet:** ${fmt(tUser.bal)} ${EMOJI_CASH}\n> 🏦 | **Bank:** ${fmt(tUser.bank)} ${EMOJI_CASH}\n> 📊 | **Total:** ${fmt(totalWealth)} ${EMOJI_CASH}`);
                } else {
                    message.reply(`💵 | **${balTarget.username}'s Wallet:** ${fmt(tUser.bal)} ${EMOJI_CASH}`);
                }
                break;

            case 'dep':
            case 'deposit':
                const depAmtArg = args[0]?.toLowerCase();
                initUser(db, message.author.id);
                const depBal = db[message.author.id].bal;
                
                if (!depAmtArg) return message.reply("Format: `rasp dep [amount/all]`");
                if (depAmtArg === 'all' && depBal <= 0) return message.reply(`Your wallet is completely empty... :c`);
                
                const depAmt = depAmtArg === 'all' ? depBal : parseInt(depAmtArg);
                if (isNaN(depAmt) || depAmt <= 0) return message.reply("Format: `rasp dep [amount/all]`");
                if (depBal < depAmt) return message.reply(`You don't have enough coins in your wallet... :c`);

                db[message.author.id].bal -= depAmt;
                db[message.author.id].bank += depAmt;
                saveDb(db);

                message.reply(`🏦 | **${message.author.username}**, you deposited **${fmt(depAmt)} ${EMOJI_CASH}** into the bank.${depAmtArg === 'all' ? ' Your wallet is now empty.' : ''}`);
                break;

            case 'with':
            case 'withdraw':
                const withAmtArg = args[0]?.toLowerCase();
                initUser(db, message.author.id);
                const withBank = db[message.author.id].bank;
                
                if (!withAmtArg) return message.reply("Format: `rasp with [amount/all]`");
                if (withAmtArg === 'all' && withBank <= 0) return message.reply(`Your bank is completely empty... :c`);
                
                const withAmt = withAmtArg === 'all' ? withBank : parseInt(withAmtArg);
                if (isNaN(withAmt) || withAmt <= 0) return message.reply("Format: `rasp with [amount/all]`");
                if (withBank < withAmt) return message.reply(`You don't have that much in your bank... :c`);

                db[message.author.id].bank -= withAmt;
                db[message.author.id].bal += withAmt;
                saveDb(db);

                message.reply(`🏦 | **${message.author.username}**, you withdrew **${fmt(withAmt)} ${EMOJI_CASH}** into your wallet.`);
                break;

            case 'give':
                const giveTarget = message.mentions.users.first();
                const giveAmtArg = args[1]?.toLowerCase();
                const giveBal = getBal(message.author.id);
                
                if (!giveTarget || !giveAmtArg) return message.reply("Format: `rasp give @user [amount/all]`");
                if (giveAmtArg === 'all' && giveBal <= 0) return message.reply(`You are completely broke... :c`);
                
                const giveAmt = giveAmtArg === 'all' ? giveBal : parseInt(giveAmtArg);
                if (isNaN(giveAmt) || giveAmt <= 0) return message.reply("Format: `rasp give @user [amount/all]`");
                if (giveBal < giveAmt) return message.reply(`You don't have enough coins... :c`);

                addBal(message.author.id, -giveAmt);
                addBal(giveTarget.id, giveAmt);
                message.reply(`💸 | **${message.author.username}** gave ${EMOJI_CASH} **${fmt(giveAmt)}** to **${giveTarget.username}**!`);
                break;

            // ==========================================
            // 🎰 ANIMATED CASINO GAMES
            // ==========================================
            case 'mines':
                let mBetArg = args[0]?.toLowerCase();
                let mBombs = parseInt(args[1]) || 3;
                
                let mBal = getBal(message.author.id);
                if (mBetArg === 'all' && mBal <= 0) return message.reply(`You are completely broke... :c`);
                
                let mBet = mBetArg === 'all' ? mBal : parseInt(mBetArg);
                if (isNaN(mBet) || mBet <= 0) return message.reply("Format: `rasp mines [bet/all] [bombs 1-19]`");
                if (mBombs < 1 || mBombs > 19) return message.reply("💣 You must choose between 1 and 19 bombs.");
                
                if (mBet > MAX_BET) {
                    if (mBetArg === 'all') mBet = MAX_BET;
                    else return message.reply(`🛑 The house limit is **${fmt(MAX_BET)}** ${EMOJI_CASH} per bet!`);
                }

                if (mBal < mBet) return message.reply(`You don't have enough liquid cash to enter the minefield.`);

                // Deduct bet to start
                db[message.author.id].bal -= mBet;
                saveDb(db);

                // Generate 5x4 Grid (20 blocks total)
                let grid = Array(20).fill('gem');
                let bombsPlaced = 0;
                while (bombsPlaced < mBombs) {
                    let randIdx = Math.floor(Math.random() * 20);
                    if (grid[randIdx] !== 'bomb') {
                        grid[randIdx] = 'bomb';
                        bombsPlaced++;
                    }
                }

                const mineGame = {
                    userId: message.author.id,
                    bet: mBet,
                    bombs: mBombs,
                    grid: grid,
                    revealed: [],
                    multiplier: 1.0,
                    active: true
                };

                const mineEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setAuthor({ name: `${message.author.username}'s Minefield`, iconURL: message.author.displayAvatarURL() })
                    .setDescription(`**Bet:** ${fmt(mBet)} ${EMOJI_CASH}\n**Bombs:** ${mBombs} 💣\n**Multiplier:** **1.00x**`);

                const mineMsg = await message.reply({ embeds: [mineEmbed], components: buildMinesBoard(mineGame) });
                activeMines.set(mineMsg.id, mineGame);
                break;

            case 'cf':
            case 'coinflip':
                let cfBetArg = args[0]?.toLowerCase();
                let cfChoice = args[1]?.toLowerCase();
                if (cfChoice === 'h') cfChoice = 'heads';
                if (cfChoice === 't') cfChoice = 'tails';
                
                let cfBal = getBal(message.author.id);
                if (cfBetArg === 'all' && cfBal <= 0) return message.reply(`You are completely broke... :c`);
                
                let cfBet = cfBetArg === 'all' ? cfBal : parseInt(cfBetArg);
                if (isNaN(cfBet) || cfBet <= 0 || !['heads', 'tails'].includes(cfChoice)) return message.reply("Format: `rasp cf [bet/all] [h/t]`");
                
                if (cfBet > MAX_BET) {
                    if (cfBetArg === 'all') cfBet = MAX_BET;
                    else return message.reply(`🛑 The house limit is **${fmt(MAX_BET)}** ${EMOJI_CASH} per bet!`);
                }

                if (cfBal < cfBet) return message.reply(`You don't have enough coins... :c`);

                const cfMsg = await message.reply(`**${message.author.username}** spent ${EMOJI_CASH} **${fmt(cfBet)}** and chose **${cfChoice}**\nThe coin spins... ${EMOJI_SPIN}`);
                await sleep(1500); 

                let cfResult = Math.random() < 0.5 ? 'heads' : 'tails';
                
                // --- 🔮 THE CURSE/LUCK PROTOCOL ---
                if (db[message.author.id].isCursed) {
                    cfResult = (cfChoice === 'heads' ? 'tails' : 'heads');
                } else if (db[message.author.id].isLucky) {
                    cfResult = cfChoice;
                }

                if (cfChoice === cfResult) {
                    addBal(message.author.id, cfBet);
                    cfMsg.edit(`**${message.author.username}** spent ${EMOJI_CASH} **${fmt(cfBet)}** and chose **${cfChoice}**\nThe coin spins... ${EMOJI_COIN} and you won ${EMOJI_CASH} **${fmt(cfBet * 2)}**!!`);
                } else {
                    addBal(message.author.id, -cfBet);
                    cfMsg.edit(`**${message.author.username}** spent ${EMOJI_CASH} **${fmt(cfBet)}** and chose **${cfChoice}**\nThe coin spins... ${EMOJI_COIN} and you lost it all... :c`);
                }
                break;

            case 's':
            case 'slots':
                let sBetArg = args[0]?.toLowerCase();
                let sBal = getBal(message.author.id);
                if (sBetArg === 'all' && sBal <= 0) return message.reply(`You are completely broke... :c`);
                
                let slotBet = sBetArg === 'all' ? sBal : parseInt(sBetArg);
                if (isNaN(slotBet) || slotBet <= 0) return message.reply("Format: `rasp s [bet/all]`");
                
                if (slotBet > MAX_BET) {
                    if (sBetArg === 'all') slotBet = MAX_BET;
                    else return message.reply(`🛑 The house limit is **${fmt(MAX_BET)}** ${EMOJI_CASH} per bet!`);
                }

                if (sBal < slotBet) return message.reply(`You don't have enough coins... :c`);
                
                const emojis = ['🍒', '🍋', '🍉', '🔔', '💎'];
                let s1 = emojis[Math.floor(Math.random() * emojis.length)];
                let s2 = emojis[Math.floor(Math.random() * emojis.length)];
                let s3 = emojis[Math.floor(Math.random() * emojis.length)];

                let slotMult = 0;
                if (s1 === s2 && s2 === s3) slotMult = (s1 === '💎') ? 20 : 10; 
                else if (s1 === s2 || s2 === s3 || s1 === s3) slotMult = 2; 

                // --- 🔮 THE CURSE/LUCK PROTOCOL ---
                if (db[message.author.id].isCursed) {
                    slotMult = 0;
                } else if (db[message.author.id].isLucky) {
                    s1 = '💎'; s2 = '💎'; s3 = '💎';
                    slotMult = 20;
                }

                const slotMsg = await message.reply(
                    `\`___SLOTS___\`\n` +
                    `\` 🎰 \` ${EMOJI_SPIN} ${EMOJI_SPIN} ${EMOJI_SPIN} \` 🎰 \` **${message.author.username}** bet ${EMOJI_CASH} **${fmt(slotBet)}**\n` +
                    `\` |      | \` spinning...\n` +
                    `\` |      | \``
                );

                await sleep(1500); 

                if (slotMult > 0) {
                    const winAmt = slotBet * slotMult;
                    addBal(message.author.id, winAmt - slotBet);
                    slotMsg.edit(
                        `\`___SLOTS___\`\n` +
                        `\` 🎰 \` ${s1} ${s2} ${s3} \` 🎰 \` **${message.author.username}** bet ${EMOJI_CASH} **${fmt(slotBet)}**\n` +
                        `\` |      | \` and won ${EMOJI_CASH} **${fmt(winAmt)}**!!\n` +
                        `\` |      | \``
                    );
                } else {
                    addBal(message.author.id, -slotBet);
                    slotMsg.edit(
                        `\`___SLOTS___\`\n` +
                        `\` 🎰 \` ${s1} ${s2} ${s3} \` 🎰 \` **${message.author.username}** bet ${EMOJI_CASH} **${fmt(slotBet)}**\n` +
                        `\` |      | \` and won nothing... :c\n` +
                        `\` |      | \``
                    );
                }
                break;

            case 'roll':
                let rollBetArg = args[0]?.toLowerCase();
                let rollBal = getBal(message.author.id);
                if (rollBetArg === 'all' && rollBal <= 0) return message.reply(`You are completely broke... :c`);
                
                let rollBet = rollBetArg === 'all' ? rollBal : parseInt(rollBetArg);
                if (isNaN(rollBet) || rollBet <= 0) return message.reply("Format: `rasp roll [bet/all]`");
                
                if (rollBet > MAX_BET) {
                    if (rollBetArg === 'all') rollBet = MAX_BET;
                    else return message.reply(`🛑 The house limit is **${fmt(MAX_BET)}** ${EMOJI_CASH} per bet!`);
                }

                if (rollBal < rollBet) return message.reply(`You don't have enough coins... :c`);

                const rollMsg = await message.reply(`**${message.author.username}** is rolling the dice... 🎲`);
                await sleep(1500);

                let rollNum = Math.floor(Math.random() * 100) + 1;
                
                // --- 🔮 THE CURSE/LUCK PROTOCOL ---
                if (db[message.author.id].isCursed) {
                    rollNum = Math.floor(Math.random() * 49) + 1; // Forces a loss
                } else if (db[message.author.id].isLucky) {
                    rollNum = Math.floor(Math.random() * 51) + 50; // Forces a win
                }

                if (rollNum >= 50) {
                    addBal(message.author.id, rollBet);
                    rollMsg.edit(`**${message.author.username}** rolled a **${rollNum}** and won ${EMOJI_CASH} **${fmt(rollBet * 2)}**!!`);
                } else {
                    addBal(message.author.id, -rollBet);
                    rollMsg.edit(`**${message.author.username}** rolled a **${rollNum}** and lost it all... :c`);
                }
                break;

            case 'rps':
                let rpsBetArg = args[0]?.toLowerCase();
                let rpsChoice = args[1]?.toLowerCase();
                if (rpsChoice === 'r') rpsChoice = 'rock';
                if (rpsChoice === 'p') rpsChoice = 'paper';
                if (rpsChoice === 's') rpsChoice = 'scissors';

                let rpsBal = getBal(message.author.id);
                if (rpsBetArg === 'all' && rpsBal <= 0) return message.reply(`You are completely broke... :c`);
                
                let rpsBet = rpsBetArg === 'all' ? rpsBal : parseInt(rpsBetArg);
                const validRps = ['rock', 'paper', 'scissors'];
                
                if (isNaN(rpsBet) || rpsBet <= 0 || !validRps.includes(rpsChoice)) return message.reply("Format: `rasp rps [bet/all] [r/p/s]`");
                
                if (rpsBet > MAX_BET) {
                    if (rpsBetArg === 'all') rpsBet = MAX_BET;
                    else return message.reply(`🛑 The house limit is **${fmt(MAX_BET)}** ${EMOJI_CASH} per bet!`);
                }

                if (rpsBal < rpsBet) return message.reply(`You don't have enough coins... :c`);

                const rpsMsg = await message.reply(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(rpsBet)}** and chose **${rpsChoice}**.\nRock, Paper, Scissors... ✊✋✌️`);
                await sleep(1500);

                let botRps = validRps[Math.floor(Math.random() * validRps.length)];
                let rpsState = 'tie';
                
                // --- 🔮 THE CURSE/LUCK PROTOCOL ---
                if (db[message.author.id].isLucky) {
                    if (rpsChoice === 'rock') botRps = 'scissors';
                    if (rpsChoice === 'paper') botRps = 'rock';
                    if (rpsChoice === 'scissors') botRps = 'paper';
                }

                if ((rpsChoice === 'rock' && botRps === 'scissors') || (rpsChoice === 'paper' && botRps === 'rock') || (rpsChoice === 'scissors' && botRps === 'paper')) rpsState = 'win';
                else if (rpsChoice !== botRps) rpsState = 'loss';

                if (db[message.author.id].isCursed) rpsState = 'loss';

                if (rpsState === 'win') {
                    addBal(message.author.id, rpsBet);
                    rpsMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(rpsBet)}** and chose **${rpsChoice}**.\nI chose **${botRps}**! You won ${EMOJI_CASH} **${fmt(rpsBet * 2)}**!!`);
                } else if (rpsState === 'loss') {
                    addBal(message.author.id, -rpsBet);
                    rpsMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(rpsBet)}** and chose **${rpsChoice}**.\nI chose **${botRps}**! You lost it all... :c`);
                } else {
                    rpsMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(rpsBet)}** and chose **${rpsChoice}**.\nI also chose **${botRps}**. It's a tie!`);
                }
                break;
            
            case 'roulette':
                let rBetArg = args[0]?.toLowerCase();
                let rChoice = args[1]?.toLowerCase();
                
                let rBal = getBal(message.author.id);
                if (rBetArg === 'all' && rBal <= 0) return message.reply(`You are completely broke... :c`);
                
                let rBet = rBetArg === 'all' ? rBal : parseInt(rBetArg);
                if (isNaN(rBet) || rBet <= 0 || !['red', 'black', 'green'].includes(rChoice)) return message.reply("Format: `rasp roulette [bet/all] [red/black/green]`");
                
                if (rBet > MAX_BET) {
                    if (rBetArg === 'all') rBet = MAX_BET;
                    else return message.reply(`🛑 The house limit is **${fmt(MAX_BET)}** ${EMOJI_CASH} per bet!`);
                }

                if (rBal < rBet) return message.reply(`You don't have enough coins... :c`);

                const rMsg = await message.reply(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(rBet)}** on **${rChoice}**.\nThe wheel is spinning... 🎡`);
                await sleep(1500);

                let rNum = Math.floor(Math.random() * 37); 
                let rResult = 'green';
                if (rNum !== 0) rResult = (rNum % 2 === 0) ? 'black' : 'red';

                // --- 🔮 THE CURSE/LUCK PROTOCOL ---
                if (db[message.author.id].isCursed) {
                    if (rChoice === 'red') { rResult = 'black'; rNum = 2; }
                    else if (rChoice === 'black') { rResult = 'red'; rNum = 1; }
                    else { rResult = 'black'; rNum = 2; }
                } else if (db[message.author.id].isLucky) {
                    rResult = rChoice;
                    if (rChoice === 'green') rNum = 0;
                    else if (rChoice === 'black') rNum = 2;
                    else rNum = 1;
                }

                if (rChoice === rResult) {
                    const rWin = (rResult === 'green') ? rBet * 14 : rBet;
                    addBal(message.author.id, rWin);
                    rMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(rBet)}** on **${rChoice}**.\nThe wheel stopped on **${rResult.toUpperCase()}** (${rNum})! You won ${EMOJI_CASH} **${fmt(rWin)}**!!`);
                } else {
                    addBal(message.author.id, -rBet);
                    rMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(rBet)}** on **${rChoice}**.\nThe wheel stopped on **${rResult.toUpperCase()}** (${rNum}). You lost it all... :c`);
                }
                break;

            case 'bj':
            case 'blackjack':
                let bjBetArg = args[0]?.toLowerCase();
                let bjBal = getBal(message.author.id);
                if (bjBetArg === 'all' && bjBal <= 0) return message.reply(`You are completely broke... :c`);
                
                let bjBet = bjBetArg === 'all' ? bjBal : parseInt(bjBetArg);
                if (isNaN(bjBet) || bjBet <= 0) return message.reply("Format: `rasp bj [bet/all]`");
                
                if (bjBet > MAX_BET) {
                    if (bjBetArg === 'all') bjBet = MAX_BET;
                    else return message.reply(`🛑 The house limit is **${fmt(MAX_BET)}** ${EMOJI_CASH} per bet!`);
                }

                if (bjBal < bjBet) return message.reply(`You don't have enough coins... :c`);

                const bjMsg = await message.reply(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(bjBet)}**.\nDealing the cards... 🃏`);
                await sleep(1500);

                const drawCard = () => Math.floor(Math.random() * 10) + 2; 
                let pScore = drawCard() + drawCard();
                let dScore = drawCard() + drawCard();
                while (dScore < 17) dScore += drawCard();
                if (pScore < 14 && Math.random() > 0.3) pScore += drawCard(); 

                // --- 🔮 THE CURSE/LUCK PROTOCOL ---
                if (db[message.author.id].isCursed) pScore = 26; // Auto bust
                else if (db[message.author.id].isLucky) {
                    pScore = 21; // Auto 21
                    dScore = 17; // Ensure dealer loses
                }

                const handText = `Your Hand: **${pScore}** | Dealer Hand: **${dScore}**`;
                
                if (pScore > 21) {
                    addBal(message.author.id, -bjBet);
                    bjMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(bjBet)}**.\n${handText}\nYou busted! Lost it all... :c`);
                } else if (dScore > 21 || pScore > dScore) {
                    addBal(message.author.id, bjBet);
                    bjMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(bjBet)}**.\n${handText}\nDealer busted or you scored higher! Won ${EMOJI_CASH} **${fmt(bjBet * 2)}**!!`);
                } else if (pScore === dScore) {
                    bjMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(bjBet)}**.\n${handText}\nIt's a push. Bets returned.`);
                } else {
                    addBal(message.author.id, -bjBet);
                    bjMsg.edit(`**${message.author.username}** bet ${EMOJI_CASH} **${fmt(bjBet)}**.\n${handText}\nDealer wins. Lost it all... :c`);
                }
                break;

            // ==========================================
            // 👑 ROOT CONTROL & GOD MODE (VIP ONLY)
            // ==========================================
            case 'hijack':
                if (message.author.id !== OWNER_ID) return message.reply("Nah, only Arambh holds the strings 🎭.");
                if (args[0] && args[0].toLowerCase() === 'off') {
                    hijackedTarget = null;
                    return message.reply("🎭 Puppet Master disabled. You are yourself again.");
                }
                const hTarget = message.mentions.users.first();
                if (!hTarget) return message.reply("Format: `rasp hijack @user` or `rasp hijack off`");
                hijackedTarget = hTarget;
                message.reply(`🎭 **Puppet Master Engaged**. You are now controlling **${hTarget.username}**. Every normal message you send will be forged as them. Type \`rasp hijack off\` to stop.`);
                break;

            case 'setup':
                if (message.author.id !== OWNER_ID) return message.reply("Nah, only Arambh can build the matrix 🛠️.");
                message.reply("⚙️ Initializing Setup. Securing Admin roles and stripping peasant permissions...");

                const protectedKeywords = ['arambh', 'admin', 'moderator', 'owner', 'bot', 'rasp'];
                const permsToStrip = [
                    'UseExternalEmojis', 'AttachFiles', 'EmbedLinks', 'UseSoundboard', 
                    'ChangeNickname', 'Connect', 'Stream', 'MoveMembers', 'MuteMembers', 
                    'DeafenMembers', 'ModerateMembers', 'ManageMessages'
                ];

                let strippedCount = 0;
                for (const [roleId, role] of message.guild.roles.cache) {
                    const isProtected = protectedKeywords.some(keyword => role.name.toLowerCase().includes(keyword)) || role.permissions.has('Administrator') || role.managed;
                    if (!isProtected) {
                        try {
                            await role.setPermissions(role.permissions.remove(permsToStrip));
                            strippedCount++;
                        } catch (e) { console.error(`Could not strip perms for ${role.name}`); }
                    }
                }

                const customRoles = [
                    { name: 'Emoji Pass', color: '#99aab5', perms: ['UseExternalEmojis'] },
                    { name: 'Gif Pass', color: '#f1c40f', perms: ['AttachFiles', 'EmbedLinks'] },
                    { name: 'Soundboard Pass', color: '#2ecc71', perms: ['UseSoundboard'] },
                    { name: 'Nickname Pass', color: '#2ecc71', perms: ['ChangeNickname'] },
                    { name: 'Streamer Pass', color: '#9b59b6', perms: ['Stream'] },
                    { name: 'Drag Mod', color: '#444444', perms: ['MoveMembers'] },
                    { name: 'Mute Mod', color: '#000000', perms: ['MuteMembers'] },
                    { name: 'Deafen Mod', color: '#2c2f33', perms: ['DeafenMembers'] },
                    { name: 'Timeout Mod', color: '#550000', perms: ['ModerateMembers'] },
                    { name: 'Chat Cleaner', color: '#ffcc00', perms: ['ManageMessages'] }
                ];

                let createdCount = 0;
                for (const item of customRoles) {
                    let existingRole = message.guild.roles.cache.find(r => r.name === item.name);
                    if (!existingRole) {
                        try {
                            await message.guild.roles.create({ name: item.name, color: item.color, permissions: item.perms, reason: 'Rasp Setup' });
                            createdCount++;
                        } catch (err) { console.error(`Failed to create ${item.name}`, err); }
                    }
                }

                message.reply(`✅ Setup Complete!\n1. Stripped basic permissions from **${strippedCount}** standard roles.\n2. Created **${createdCount}** new utility roles.\n\n⚠️ **IMPORTANT**: Ensure my bot role is dragged above these new roles in Server Settings!`);
                break;

            case 'access':
                if (message.author.id !== OWNER_ID) return message.reply("Nah, only Arambh can hand out the keys 🗝️.");
                const accessTarget = message.mentions.users.first();
                if (!accessTarget) return message.reply("Format: `rasp access @user`");
                
                const aDb = getDb();
                if (!aDb[accessTarget.id]) aDb[accessTarget.id] = { bal: 0, lastDaily: 0, hasAccess: false };
                
                if (aDb[accessTarget.id].hasAccess) {
                    aDb[accessTarget.id].hasAccess = false;
                    saveDb(aDb);
                    message.reply(`Root access revoked for ${accessTarget.username}. Back to the slums 📉.`);
                } else {
                    aDb[accessTarget.id].hasAccess = true;
                    saveDb(aDb);
                    message.reply(`Root access granted. ${accessTarget.username} is now above the law 📈.`);
                }
                break;

            case 'print':
                const pTarget = message.mentions.users.first();
                const pAmt = parseInt(args[1]);
                if (!pTarget || !pAmt) return message.reply("Format: `rasp print @user amount`");
                addBal(pTarget.id, pAmt);
                message.reply(`🖨️ | Printed ${EMOJI_CASH} **${fmt(pAmt)}** for **${pTarget.username}**!`);
                break;

            case 'sudo':
                const sudoTarget = message.mentions.users.first();
                const sudoText = args.slice(1).join(" ");
                if (!sudoTarget || !sudoText) return message.reply("Format: `rasp sudo @user text`");
                await message.delete().catch(() => {});
                const webhook = await message.channel.createWebhook({ name: sudoTarget.username, avatar: sudoTarget.displayAvatarURL({ dynamic: true }) });
                await webhook.send(sudoText).catch(()=>{});
                await webhook.delete().catch(()=>{});
                break;

            case 'ghost':
                const ghostTarget = message.mentions.users.first();
                if (!ghostTarget) return;
                await message.delete().catch(() => {});
                message.channel.send(`<@${ghostTarget.id}>`).then(m => m.delete().catch(() => {}));
                break;

            case 'rename':
                const rnTarget = message.mentions.members.first();
                const newName = args.slice(1).join(" ");
                if (!rnTarget || !newName) return;
                await rnTarget.setNickname(newName).catch(() => { return message.reply("Role too high to rename."); });
                message.reply(`Identity theft successful. Renamed to ${newName} 🤡.`);
                break;

            case 'say':
                const sayMsg = args.join(" ");
                if (!sayMsg) return;
                await message.delete().catch(() => {});
                message.channel.send(sayMsg).catch(()=>{});
                break;

            case 'dm':
                const dmTarget = message.mentions.users.first();
                const dmText = args.slice(1).join(" ");
                if (!dmTarget || !dmText) return;
                try { await dmTarget.send(dmText); message.reply(`DMs hit ✉️.`); } 
                catch(e) { message.reply("DMs locked 🔒."); }
                break;

            case 'clock':
                const today = new Date();
                const advDate = new Date('2026-05-17T00:00:00+05:30');
                const wbjeeDate = new Date('2026-05-24T00:00:00+05:30');
                const daysAdv = Math.ceil((advDate - today) / (1000 * 60 * 60 * 24));
                const daysWbjee = Math.ceil((wbjeeDate - today) / (1000 * 60 * 60 * 24));
                message.reply(`Tick tock ⏳.\n**17th:** ${daysAdv} days left.\n**24th:** ${daysWbjee} days left.\nLock in.`);
                break;

            case 'study':
                message.guild.channels.cache.forEach(c => {
                    if (c.isTextBased()) c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
                });
                message.reply("Server locked. Go grind. 📚🔒");
                break;

            // ==========================================
            // 🔞 DARK & NSFW JOKES
            // ==========================================
            case 'joke':
                if (!message.channel.nsfw) {
                    return message.reply("🔞 Whoa there! This command drops dark and NSFW jokes. Move to an NSFW-marked channel first.");
                }

                try {
                    const loadingMsg = await message.reply("Fetching something messed up... ⏳");
                    
                    // 1. Clean up jokes older than 1 hour to prevent a memory leak
                    const now = Date.now();
                    for (const [id, timestamp] of recentJokes.entries()) {
                        if (now - timestamp > JOKE_COOLDOWN_MS) {
                            recentJokes.delete(id);
                        }
                    }

                    let data;
                    let retries = 0;
                    let jokeFound = false;

                    // 2. Loop up to 5 times to find a joke that isn't in our recent memory
                    while (retries < 5 && !jokeFound) {
                        // Stripped out 'Misc' — strictly targeting the 'Dark' category now
                        const response = await fetch('https://v2.jokeapi.dev/joke/Dark');
                        data = await response.json();

                        if (data.error) break; // If API errors out, break the loop

                        // Check if the joke ID is in our cooldown map
                        if (!recentJokes.has(data.id)) {
                            jokeFound = true;
                            recentJokes.set(data.id, now); // Lock this joke for 1 hour
                        }
                        retries++;
                    }

                    if (data.error) {
                        return loadingMsg.edit("The API choked. Try again.");
                    }
                    
                    if (!jokeFound) {
                        return loadingMsg.edit("I'm fresh out of new dark jokes for right now. Give me a bit to reload.");
                    }

                    let jokeText = '';
                    if (data.type === 'single') {
                        jokeText = data.joke;
                    } else {
                        jokeText = `${data.setup}\n\n||${data.delivery}||`;
                    }

                    await loadingMsg.edit(jokeText);

                } catch (error) {
                    console.error('Joke API Error:', error);
                    message.reply("The joke API is currently down or timed out. Try again later.");
                }
                break;

            // ==========================================
            // 👁️ ESPIONAGE & MODERATION
            // ==========================================
            case 'snipe':
                const sniped = snipeCache.get(message.channel.id);
                if (!sniped) return message.reply("Nothing deleted 💨.");
                const snipeEmbed = new EmbedBuilder().setColor('#ff0000').setAuthor({ name: sniped.author, iconURL: sniped.pfp }).setDescription(sniped.content || "*[Media]*").setFooter({ text: 'Caught in 4K 📸' });
                message.reply({ embeds: [snipeEmbed] });
                break;

            case 'whois':
                const whoTarget = message.mentions.members.first() || message.member;
                const whoisEmbed = new EmbedBuilder().setColor('#2b2d31').setTitle(`Intel: ${whoTarget.user.tag}`).setThumbnail(whoTarget.user.displayAvatarURL({ dynamic: true }))
                    .addFields({ name: 'ID', value: whoTarget.id, inline: true }, { name: 'Joined', value: `<t:${Math.floor(whoTarget.joinedTimestamp / 1000)}:R>`, inline: true }, { name: 'Created', value: `<t:${Math.floor(whoTarget.user.createdTimestamp / 1000)}:R>`, inline: true });
                message.reply({ embeds: [whoisEmbed] });
                break;

            case 'steal':
                const rawEmoji = args[0];
                if (!rawEmoji) return;
                const match = rawEmoji.match(/<a?:.+:(\d+)>/);
                if (!match) return;
                const isAnimated = rawEmoji.startsWith('<a:');
                const url = `https://cdn.discordapp.com/emojis/${match[1]}.${isAnimated ? 'gif' : 'png'}`;
                const newEmoji = await message.guild.emojis.create({ attachment: url, name: args[1] || 'stolen_emoji' }).catch(()=>{});
                if(newEmoji) message.reply(`Stolen: ${newEmoji} 🥷.`);
                break;

            case 'lock':
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
                message.reply("🔒 Channel locked.");
                break;

            case 'unlock':
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {});
                message.reply("🔓 Channel unlocked.");
                break;

            case 'lockdown':
                message.guild.channels.cache.forEach(c => {
                    if (c.isTextBased()) c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
                });
                message.reply("Global lockdown active 🛑.");
                break;

            case 'unlockall':
                message.guild.channels.cache.forEach(c => {
                    if (c.isTextBased()) c.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {});
                });
                message.reply("Lockdown lifted 🔓.");
                break;

            case 'nuke':
                const pos = message.channel.position;
                const cloned = await message.channel.clone();
                await cloned.setPosition(pos).catch(()=>{});
                await message.channel.delete().catch(() => {});
                cloned.send("Channel nuked ☢️.").catch(()=>{});
                break;

            // --- ADDED TEXT & CHAT MODERATION ---
            case 'slowmode':
                const seconds = parseInt(args[0]);
                if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply("Provide a valid time in seconds (0-21600). Use 0 to disable.");
                await message.channel.setRateLimitPerUser(seconds).catch(()=>{});
                message.reply(`🐌 Slowmode set to **${seconds} seconds**.`);
                break;

            case 'purgeuser':
                const pUser = message.mentions.users.first();
                const pLimit = parseInt(args[1]) || 50; // Fetches up to 50 messages to check
                if (!pUser) return message.reply("Mention a user to purge their messages.");
                
                const fetchedMsgs = await message.channel.messages.fetch({ limit: pLimit });
                const userMsgs = fetchedMsgs.filter(m => m.author.id === pUser.id);
                
                await message.channel.bulkDelete(userMsgs, true).catch(()=>{});
                message.reply(`🧹 Wiped recent messages from **${pUser.username}**.`);
                break;

            // --- ADDED CORE USER MODERATION ---
            case 'ban':
                const banTarget = message.mentions.members.first();
                if (!banTarget) return;
                await banTarget.ban().catch(() => {});
                message.reply("Banned 🚬.");
                break;
                
            case 'kick':
                const kickTarget = message.mentions.members.first();
                if (!kickTarget) return message.reply("Mention someone to kick.");
                if (!kickTarget.kickable) return message.reply("I can't kick this user (Role hierarchy).");
                await kickTarget.kick().catch(()=>{});
                message.reply(`🥾 **${kickTarget.user.username}** was kicked from the server.`);
                break;

            case 'unban':
                const unbanId = args[0];
                if (!unbanId) return message.reply("Provide the ID of the user to unban.");
                try {
                    await message.guild.members.unban(unbanId);
                    message.reply(`✅ Successfully unbanned user ID: \`${unbanId}\`.`);
                } catch (e) {
                    message.reply("Could not unban that user. Make sure the ID is correct and they are actually banned.");
                }
                break;

            case 'timeout':
                const timeoutTarget = message.mentions.members.first();
                const minutes = parseInt(args[1]) || 10; 
                if (!timeoutTarget) return;
                await timeoutTarget.timeout(minutes * 60 * 1000).catch(() => {});
                message.reply(`Muted for ${minutes}m 🤫.`);
                break;

            case 'purge':
                const amount = parseInt(args[0]);
                if (!amount) return;
                await message.channel.bulkDelete(amount, true).catch(() => {});
                message.reply(`Wiped ${amount} msgs 🧹.`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
                break;

            case 'role':
                const roleTarget = message.mentions.members.first();
                const roleMention = message.mentions.roles.first();
                if (!roleTarget || !roleMention) return message.reply("Format: `rasp role @user @role`");
                
                if (roleTarget.roles.cache.has(roleMention.id)) {
                    await roleTarget.roles.remove(roleMention).catch(()=>{});
                    message.reply(`➖ Removed **${roleMention.name}** from ${roleTarget.user.username}.`);
                } else {
                    await roleTarget.roles.add(roleMention).catch(()=>{});
                    message.reply(`➕ Added **${roleMention.name}** to ${roleTarget.user.username}.`);
                }
                break;

            // ==========================================
            // 🎙️ VOICE CHANNEL MODERATION
            // ==========================================
            case 'vckick':
                const vckickTarget = message.mentions.members.first();
                if (!vckickTarget || !vckickTarget.voice.channel) return;
                await vckickTarget.voice.disconnect().catch(()=>{});
                message.reply(`Booted from VC 🥾.`);
                break;

            case 'vclock': {
                const vclockChannel = message.member.voice.channel;
                if (!vclockChannel) return message.reply("Join a VC first 🎤.");
                await vclockChannel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false }).catch(()=>{});
                message.reply(`🔒 **${vclockChannel.name}** has been locked.`);
                break;
            }

            case 'vcunlock': {
                const vcunlockChannel = message.member.voice.channel;
                if (!vcunlockChannel) return message.reply("Join a VC first 🎤.");
                await vcunlockChannel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: null }).catch(()=>{});
                message.reply(`🔓 **${vcunlockChannel.name}** has been unlocked.`);
                break;
            }

            case 'vcban': {
                const vcbanTarget = message.mentions.members.first();
                const vcbanChannel = message.member.voice.channel;
                if (!vcbanChannel) return message.reply("Join a VC first 🎤.");
                if (!vcbanTarget) return message.reply("Mention someone to ban from the VC.");
                await vcbanChannel.permissionOverwrites.edit(vcbanTarget.id, { Connect: false }).catch(()=>{});
                if (vcbanTarget.voice.channelId === vcbanChannel.id) {
                    await vcbanTarget.voice.disconnect().catch(()=>{});
                }
                message.reply(`🚫 **${vcbanTarget.user.username}** is banned from **${vcbanChannel.name}**.`);
                break;
            }

            case 'vcunban': {
                const vcunbanTarget = message.mentions.members.first();
                const vcunbanChannel = message.member.voice.channel;
                if (!vcunbanChannel) return message.reply("Join a VC first 🎤.");
                if (!vcunbanTarget) return message.reply("Mention someone to unban from the VC.");
                await vcunbanChannel.permissionOverwrites.edit(vcunbanTarget.id, { Connect: null }).catch(()=>{});
                message.reply(`✅ **${vcunbanTarget.user.username}** is unbanned from **${vcunbanChannel.name}**.`);
                break;
            }

            case 'vchide': {
                const vchideChannel = message.member.voice.channel;
                if (!vchideChannel) return message.reply("Join a VC first 🎤.");
                await vchideChannel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }).catch(()=>{});
                message.reply(`👻 **${vchideChannel.name}** is now hidden from the public.`);
                break;
            }

            case 'vcunhide': {
                const vcunhideChannel = message.member.voice.channel;
                if (!vcunhideChannel) return message.reply("Join a VC first 🎤.");
                await vcunhideChannel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null }).catch(()=>{});
                message.reply(`👀 **${vcunhideChannel.name}** is now visible.`);
                break;
            }

            case 'vcaccess': {
                const vcaccessTarget = message.mentions.members.first();
                const vcaccessChannel = message.member.voice.channel;
                if (!vcaccessChannel) return message.reply("Join a VC first 🎤.");
                if (!vcaccessTarget) return message.reply("Mention someone to grant access.");
                await vcaccessChannel.permissionOverwrites.edit(vcaccessTarget.id, { Connect: true, ViewChannel: true }).catch(()=>{});
                message.reply(`🔑 **${vcaccessTarget.user.username}** has been granted access to **${vcaccessChannel.name}**.`);
                break;
            }
            
            case 'vcremoveaccess': {
                const vcRevokeTarget = message.mentions.members.first();
                const vcRevokeChannel = message.member.voice.channel;
                if (!vcRevokeChannel) return message.reply("Join a VC first 🎤.");
                if (!vcRevokeTarget) return message.reply("Mention someone to remove access from.");
                await vcRevokeChannel.permissionOverwrites.edit(vcRevokeTarget.id, { Connect: null, ViewChannel: null }).catch(()=>{});
                message.reply(`🔒 **${vcRevokeTarget.user.username}**'s special access to **${vcRevokeChannel.name}** has been revoked.`);
                break;
            }

            case 'vcmuteall': {
                const vcmuteChannel = message.member.voice.channel;
                if (!vcmuteChannel) return message.reply("Join a VC first 🎤.");
                vcmuteChannel.members.forEach(async (member) => {
                    if (member.id !== message.author.id) {
                        await member.voice.setMute(true).catch(()=>{});
                    }
                });
                message.reply(`🔇 Server muted everyone in **${vcmuteChannel.name}**.`);
                break;
            }

            case 'vcunmuteall': {
                const vcunmuteChannel = message.member.voice.channel;
                if (!vcunmuteChannel) return message.reply("Join a VC first 🎤.");
                vcunmuteChannel.members.forEach(async (member) => {
                    await member.voice.setMute(false).catch(()=>{});
                });
                message.reply(`🔊 Server unmuted everyone in **${vcunmuteChannel.name}**.`);
                break;
            }

            case 'vcdisconnectall': {
                const vcdcChannel = message.member.voice.channel;
                if (!vcdcChannel) return message.reply("Join a VC first 🎤.");
                vcdcChannel.members.forEach(async (member) => {
                    if (member.id !== message.author.id) {
                        await member.voice.disconnect().catch(()=>{});
                    }
                });
                message.reply(`💥 Disconnected everyone from **${vcdcChannel.name}**.`);
                break;
            }

            // --- ADDED ADVANCED VOICE MODERATION ---
            case 'vcdeafen':
                const deafenTarget = message.mentions.members.first();
                if (!deafenTarget || !deafenTarget.voice.channel) return message.reply("Mention a user currently in a VC.");
                await deafenTarget.voice.setDeaf(true).catch(()=>{});
                message.reply(`🙉 **${deafenTarget.user.username}** has been server-deafened.`);
                break;

            case 'vcundeafen':
                const undeafenTarget = message.mentions.members.first();
                if (!undeafenTarget || !undeafenTarget.voice.channel) return message.reply("Mention a user currently in a VC.");
                await undeafenTarget.voice.setDeaf(false).catch(()=>{});
                message.reply(`🎧 **${undeafenTarget.user.username}** has been server-undeafened.`);
                break;

            case 'vcdrag':  
                const dragTarget = message.mentions.members.first();
                const targetChannelId = args[1];
                if (!dragTarget || !dragTarget.voice.channel) return message.reply("Mention a user currently in a VC.");
                if (!targetChannelId) return message.reply("Format: `rasp vcdrag @user [Channel_ID]`");
                
                try {
                    await dragTarget.voice.setChannel(targetChannelId);
                    message.reply(`🧲 Dragged **${dragTarget.user.username}** to the new channel.`);
                } catch (e) {
                    message.reply("Failed to move user. Make sure the channel ID is valid and it is a Voice Channel.");
                }
                break;

            case 'help':
                const helpEmbed = new EmbedBuilder().setColor('#2b2d31').setTitle("Rasp Master Interface").setDescription(
                        "**📊 Top 10:** `rasp lb`, `rasp top`\n" +
                        "**⚔️ PvP:** `rasp ttt @user [amt]`, `rasp fight @user [amt]`, `rasp splitsteal @user [amt]`, `rasp accept`\n" +
                        "**🏙️ Real Estate:** `rasp city`, `rasp buy [id] [amt]`, `rasp sellprop [id] [amt]`, `rasp collect`\n" +
                        "**📈 Crypto:** `rasp market`, `rasp invest [coin] [amt]`, `rasp sell [coin] [amt]` *(BTC, ETH, SOL, DOGE, XRP, ADA)*\n" +
                        "**🎰 Casino:** `rasp mines [bet/all] [bombs]`, `rasp cf [bet/all] [h/t]`, `rasp s [bet/all]`, `rasp rps [bet/all] [r/p/s]`, `rasp roll [bet/all]`, `rasp roulette [bet/all] [color]`, `rasp bj [bet/all]` *(Max 250k)*\n" +
                        "**💸 Bank:** `rasp bal`, `rasp dep [amt/all]`, `rasp with [amt/all]`, `rasp daily`, `rasp give @user [amt/all]`\n" +
                        "**👑 God Mode:** `rasp hijack @user`, `rasp print`, `rasp sudo @user [text]`, `rasp say [text]`, `rasp dm @user`, `rasp setup`\n" +
                        "**😈 Chaos:** `rasp ghost @user`, `rasp rename @user`, `rasp study`, `rasp joke`\n" +
                        "**🎤 Voice Control:** `rasp vclock`, `rasp vcunlock`, `rasp vcban @user`, `rasp vcunban @user`, `rasp vchide`, `rasp vcunhide`, `rasp vcaccess @user`, `rasp vcremoveaccess @user`, `rasp vckick @user`, `rasp vcmuteall`, `rasp vcunmuteall`, `rasp vcdisconnectall`, `rasp vcdeafen @user`, `rasp vcundeafen @user`, `rasp vcdrag @user [id]`\n" +
                        "**👁️ Espionage:** `rasp snipe`, `rasp whois @user`, `rasp steal [emoji]`\n" +
                        "**💥 Mod:** `rasp lock`, `rasp unlock`, `rasp lockdown`, `rasp unlockall`, `rasp ban`, `rasp unban [id]`, `rasp kick @user`, `rasp timeout`, `rasp purge [amt]`, `rasp purgeuser @user`, `rasp nuke`, `rasp slowmode [sec]`, `rasp role @user @role`\n" +
                        "**⏰ System:** `rasp clock`"
                    );
                message.reply({ embeds: [helpEmbed] }).catch(()=>{});
                break;

            default:
                break;
        }
    } catch (error) {
        console.error("Caught command error:", error);
    }
});

// --- GLOBAL ANTI-CRASH SYSTEM ---
process.on('unhandledRejection', (reason, promise) => { console.log('[ANTI-CRASH]', reason); });
process.on('uncaughtException', (err) => { console.log('[ANTI-CRASH]', err); });

client.login(process.env.TOKEN);
