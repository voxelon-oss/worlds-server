export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Map();
    this.players = new Map();
    this.worldBlocks = new Map();
    this.sessions = new Map();
    this.blockRegistry = new Map();
    this.weaponRegistry = new Map();
    this.toolRegistry = new Map();
    this.playerUI = new Map();
    this.rooms = new Map();
    
    this.PLATFORM_SIZE = 30;
    this.PLATFORM_HEIGHT = 40;
    this.MAX_CHAT_HISTORY = 100;
    this.chatHistory = [];
    
    this.premadeMessages = [
      "Hello!", "GG!", "Nice!", "Help!", "Follow me!",
      "Watch out!", "Thanks!", "Good luck!", "Fight?", "Peace!",
      "Over here!", "Nice build!", "Bye!", "LOL", "Oops!"
    ];
    
    this.SERVER_CONFIG = {
      name: "WORLDS Official",
      description: "The official WORLDS server - Build, Fight, Survive!",
      maxPlayers: 50,
      previewBlock: "grass",
      requireLogin: true,
      version: "0.7.0-beta"
    };
    
    this.loginFormConfig = {
      title: "Welcome",
      subtitle: "Enter your credentials",
      backgroundColor: "#0a0a15",
      accentColor: "#8b5cf6",
      buttonText: "ENTER WORLD",
      registerButtonText: "CREATE ACCOUNT",
      showRememberMe: true,
      logoText: "WORLDS",
      customCSS: ""
    };
    
    this.initializeTextures();
    this.generateWorld();
  }

  initializeTextures() {
    const grassTexture = this.createDefaultTexture('#4a9c2d', '#3d7a23', '#5cb33e');
    const stoneTexture = this.createDefaultTexture('#808080', '#696969', '#909090');
    const swordTexture = this.createDefaultTexture('#c0c0c0', '#a0a0a0', '#d0d0d0');
    const mattockTexture = this.createDefaultTexture('#8b4513', '#654321', '#a0522d');
    
    this.blockRegistry.set('grass', { name: 'grass', displayName: 'Grass Block', hardness: 0.6, drops: 'grass', transparent: false, solid: true, blastResistance: 1.0, lightLevel: 0, flammable: false, texture: grassTexture });
    this.blockRegistry.set('stone', { name: 'stone', displayName: 'Stone', hardness: 1.5, drops: 'stone', transparent: false, solid: true, blastResistance: 1.5, lightLevel: 0, flammable: false, texture: stoneTexture });
    this.weaponRegistry.set('sword', { name: 'sword', displayName: 'Iron Sword', damage: 25, attackSpeed: 0.4, knockback: 0.8, range: 3.5, critChance: 0.15, critMultiplier: 1.5, durability: -1, enchantable: true, texture: swordTexture });
    this.toolRegistry.set('mattock', { name: 'mattock', displayName: 'Iron Mattock', breakSpeed: 2.5, durability: 100, efficiency: { stone: 2.0, grass: 1.5 }, damage: 5, texture: mattockTexture });
  }

  createDefaultTexture(primary, secondary, highlight) {
    const texture = [];
    for (let y = 0; y < 16; y++) {
      const row = [];
      for (let x = 0; x < 16; x++) {
        if ((x + y) % 7 === 0 && Math.random() > 0.5) row.push(highlight);
        else if (Math.random() > 0.7) row.push(secondary);
        else row.push(primary);
      }
      texture.push(row);
    }
    return texture;
  }

  generateWorld() {
    this.worldBlocks.clear();
    for (let x = -this.PLATFORM_SIZE; x <= this.PLATFORM_SIZE; x++) {
      for (let z = -this.PLATFORM_SIZE; z <= this.PLATFORM_SIZE; z++) {
        this.worldBlocks.set(`${x},${this.PLATFORM_HEIGHT},${z}`, 'grass');
      }
    }
    for (let x = -this.PLATFORM_SIZE; x <= this.PLATFORM_SIZE; x++) {
      for (let z = -this.PLATFORM_SIZE; z <= this.PLATFORM_SIZE; z++) {
        this.worldBlocks.set(`${x},${this.PLATFORM_HEIGHT - 1},${z}`, 'stone');
        if (Math.random() < 0.7) this.worldBlocks.set(`${x},${this.PLATFORM_HEIGHT - 2},${z}`, 'stone');
      }
    }
  }

  async acceptWebSocket(webSocket) {
    const id = crypto.randomUUID();
    const socketData = { socket: webSocket, id, username: null, sessionToken: null, connected: false, sid: id.slice(0, 20) };
    this.sockets.set(id, socketData);
    this.rooms.set(id, new Set());
    
    webSocket.accept();
    
    webSocket.addEventListener('message', async (event) => {
      try {
        const text = event.data;
        this.handleSocketMessage(socketData, text);
      } catch (err) { console.error('Message error:', err); }
    });
    
    webSocket.addEventListener('close', () => this.handleDisconnect(socketData));
  }

  handleSocketMessage(socketData, text) {
    if (text === '2') { this.send(socketData, '3'); return; }
    if (text.startsWith('0')) { this.send(socketData, `0{"sid":"${socketData.sid}","upgrades":[],"pingInterval":25000,"pingTimeout":20000}`); return; }
    if (text.startsWith('40')) { socketData.connected = true; this.send(socketData, '40'); return; }
    if (text.startsWith('42')) {
      const msg = text.slice(2);
      try {
        const [event, data] = JSON.parse(msg);
        this.handleSocketEvent(socketData, event, data);
      } catch (e) {}
    }
  }

  send(socketData, message) {
    try { socketData.socket.send(message); } catch (err) {}
  }

  emit(socketData, event, data) {
    const msg = JSON.stringify([event, data]);
    this.send(socketData, '42' + msg);
  }

  broadcast(event, data, excludeId = null) {
    for (const [id, socketData] of this.sockets) {
      if (id !== excludeId && socketData.connected) this.emit(socketData, event, data);
    }
  }

  handleSocketEvent(socketData, event, data) {
    switch (event) {
      case 'register': this.handleRegister(socketData, data); break;
      case 'login': this.handleLogin(socketData, data); break;
      case 'move': this.handleMove(socketData, data); break;
      case 'breakBlock': this.handleBreakBlock(socketData, data); break;
      case 'placeBlock': this.handlePlaceBlock(socketData, data); break;
      case 'attack': this.handleAttack(socketData, data); break;
      case 'respawn': this.handleRespawn(socketData); break;
      case 'chat': this.handleChat(socketData, data); break;
    }
  }

  handleRegister(socketData, data) {
    this.registerUser(data.username, data.password).then(result => {
      this.emit(socketData, 'registerResult', result);
      if (result.success) {
        this.loginUser(data.username, data.password).then(loginResult => {
          if (loginResult.success) this.initializePlayer(socketData, data.username, loginResult);
        });
      }
    });
  }

  handleLogin(socketData, data) {
    this.loginUser(data.username, data.password).then(result => {
      if (result.success) this.initializePlayer(socketData, data.username, result);
      else this.emit(socketData, 'loginResult', result);
    });
  }

  async registerUser(username, password) {
    const existing = await this.env.USERS.get(username);
    if (existing) return { success: false, error: 'Username taken' };
    if (username.length < 3 || username.length > 16) return { success: false, error: 'Username: 3-16 characters' };
    if (password.length < 4) return { success: false, error: 'Password: 4+ characters' };
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return { success: false, error: 'Letters, numbers, underscore only' };
    const salt = crypto.randomUUID();
    const hash = await this.hashPassword(password, salt);
    const userData = { passwordHash: hash, salt, createdAt: Date.now(), data: { position: null, inventory: null, lastSeen: Date.now() } };
    await this.env.USERS.put(username, JSON.stringify(userData));
    return { success: true };
  }

  async loginUser(username, password) {
    const userStr = await this.env.USERS.get(username);
    if (!userStr) return { success: false, error: 'User not found' };
    const user = JSON.parse(userStr);
    const hash = await this.hashPassword(password, user.salt);
    if (hash !== user.passwordHash) return { success: false, error: 'Wrong password' };
    const token = crypto.randomUUID();
    this.sessions.set(token, username);
    return { success: true, token, userData: user.data };
  }

  async hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async saveUserData(username, data) {
    const userStr = await this.env.USERS.get(username);
    if (userStr) {
      const user = JSON.parse(userStr);
      user.data = { ...user.data, ...data, lastSeen: Date.now() };
      await this.env.USERS.put(username, JSON.stringify(user));
    }
  }

  initializePlayer(socketData, username, loginResult) {
    socketData.username = username;
    socketData.sessionToken = loginResult.token;
    const userData = loginResult.userData;
    const spawn = { x: userData.position?.x ?? (Math.random() * 10 - 5), y: userData.position?.y ?? (this.PLATFORM_HEIGHT + 3), z: userData.position?.z ?? (Math.random() * 10 - 5) };
    const defaultInv = [{ name: 'Sword', type: 'weapon', art: 'sword' }, { name: 'Mattock', type: 'tool', art: 'mattock' }, null, null, null, null, null, null, null];
    const blockTextures = Object.fromEntries(Array.from(this.blockRegistry.entries()).map(([k, v]) => [k, v.texture]));
    const itemTextures = {};
    for (const [k, v] of this.weaponRegistry) itemTextures[k] = v.texture;
    for (const [k, v] of this.toolRegistry) itemTextures[k] = v.texture;
    const player = { id: socketData.id, username, position: spawn, rotation: { x: 0, y: 0 }, health: 100, heldItem: 0, inventory: userData.inventory || defaultInv, isSwinging: false, isDead: false };
    this.players.set(socketData.id, player);
    this.emit(socketData, 'serverInfo', { name: this.SERVER_CONFIG.name, description: this.SERVER_CONFIG.description, maxPlayers: this.SERVER_CONFIG.maxPlayers, currentPlayers: this.players.size, requireLogin: this.SERVER_CONFIG.requireLogin, version: this.SERVER_CONFIG.version, previewTexture: this.blockRegistry.get('grass')?.texture, loginForm: this.loginFormConfig });
    this.emit(socketData, 'loginResult', { success: true, autoLogin: true });
    this.emit(socketData, 'init', { id: socketData.id, username, players: Array.from(this.players.values()).filter(p => p.id !== socketData.id), world: Array.from(this.worldBlocks.entries()), premadeMessages: this.premadeMessages, blockTextures, itemTextures, weapons: Object.fromEntries(this.weaponRegistry), tools: Object.fromEntries(this.toolRegistry), blocks: Object.fromEntries(this.blockRegistry) });
    this.broadcast('chat', { type: 'join', username }, socketData.id);
    this.broadcast('playerJoin', player, socketData.id);
  }

  handleMove(socketData, data) {
    const p = this.players.get(socketData.id);
    if (p && !p.isDead) {
      Object.assign(p, { position: data.position, rotation: data.rotation, heldItem: data.heldItem, isSwinging: data.isSwinging || false });
      if (data.inventory) p.inventory = data.inventory;
      this.broadcast('playerMove', { id: socketData.id, ...data }, socketData.id);
    }
  }

  handleBreakBlock(socketData, data) {
    const key = `${data.x},${data.y},${data.z}`;
    const blockType = this.worldBlocks.get(key);
    if (blockType) {
      this.worldBlocks.delete(key);
      const block = this.blockRegistry.get(blockType);
      this.broadcast('blockBroken', { x: data.x, y: data.y, z: data.z, by: socketData.id, type: block?.drops ?? blockType });
    }
  }

  handlePlaceBlock(socketData, data) {
    const key = `${data.x},${data.y},${data.z}`;
    if (!this.worldBlocks.has(key) && this.blockRegistry.has(data.type)) {
      this.worldBlocks.set(key, data.type);
      this.broadcast('blockPlaced', { x: data.x, y: data.y, z: data.z, type: data.type, by: socketData.id });
    }
  }

  handleAttack(socketData, data) {
    const target = this.players.get(data.targetId);
    const attacker = this.players.get(socketData.id);
    if (!target || !attacker || target.isDead || attacker.isDead) return;
    const item = attacker.inventory[attacker.heldItem];
    const weapon = item?.type === 'weapon' ? this.weaponRegistry.get(item.art) : null;
    const damage = weapon?.damage ?? 10;
    const knockbackStr = weapon?.knockback ?? 0.3;
    let finalDamage = damage;
    let isCrit = false;
    if (weapon && Math.random() < (weapon.critChance ?? 0)) { finalDamage = Math.floor(damage * (weapon.critMultiplier ?? 1.5)); isCrit = true; }
    target.health -= finalDamage;
    const dx = target.position.x - attacker.position.x;
    const dz = target.position.z - attacker.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    this.broadcast('playerHit', { id: data.targetId, health: target.health, by: socketData.id, damage: finalDamage, isCrit, knockback: { x: (dx / dist) * knockbackStr, y: 0.25, z: (dz / dist) * knockbackStr } });
    if (target.health <= 0) { target.isDead = true; this.broadcast('playerDeath', { id: data.targetId, killerName: attacker.username, victimName: target.username }); }
  }

  handleRespawn(socketData) {
    const p = this.players.get(socketData.id);
    if (p) {
      p.health = 100;
      p.isDead = false;
      p.position = { x: Math.random() * 10 - 5, y: this.PLATFORM_HEIGHT + 3, z: Math.random() * 10 - 5 };
      this.broadcast('playerRespawn', { id: socketData.id, position: p.position, health: 100 });
    }
  }

  handleChat(socketData, data) {
    const p = this.players.get(socketData.id);
    if (p && data >= 0 && data < this.premadeMessages.length) this.broadcast('chat', { type: 'message', username: p.username, message: this.premadeMessages[data] });
  }

  handleDisconnect(socketData) {
    const p = this.players.get(socketData.id);
    if (p) {
      if (socketData.username) this.saveUserData(socketData.username, { position: p.position, inventory: p.inventory });
      this.broadcast('chat', { type: 'leave', username: p.username });
      this.broadcast('playerLeave', { id: socketData.id });
      this.players.delete(socketData.id);
      this.playerUI.delete(socketData.id);
      if (socketData.sessionToken) this.sessions.delete(socketData.sessionToken);
    }
    this.sockets.delete(socketData.id);
    this.rooms.delete(socketData.id);
  }
}
