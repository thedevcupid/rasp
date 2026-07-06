<div align="center">

  <!-- HEADER BANNER -->
  <img src="https://capsule-render.vercel.app/api?type=rect&color=0:000000,100:0d1117&height=150&text=Rasp%20Bot&fontSize=60&fontColor=00ffcc&fontAlignY=50" alt="Rasp Banner" width="100%" />

  <br><br>

  <p>
    <b>Automating the network, managing economy, and executing commands.</b>
  </p>

  <!-- BADGES -->
  <p>
    <img src="https://img.shields.io/badge/Status-Online-00ff00?style=for-the-badge" alt="Status" />
    <img src="https://img.shields.io/badge/Version-1.0.0-000000?style=for-the-badge&logo=github&logoColor=white" alt="Version" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="NodeJS" />
  </p>

</div>

<hr>

<h3>⚡ System Overview</h3>
<p>
  Rasp is a custom-built Discord automation engine designed for seamless server management and user interaction. Operating on a scalable Node.js backend, it features a modular command handler and an integrated local economy tracking system.
</p>

<br>

<h3>🛠️ Core Architecture</h3>
<ul>
  <li><b>Modular Command Handler (<code>index.js</code>):</b> Rapid response interaction logic and core routing.</li>
  <li><b>Integrated Economy System (<code>economy.json</code>):</b> Tracks user balances, transactions, and server economy using persistent local JSON storage.</li>
  <li><b>Secure Environment:</b> Tokens and sensitive variables are sandboxed securely within <code>.env</code> configurations.</li>
</ul>

<hr>

<h3>💻 Installation & Deployment</h3>

<h4>1. Clone the Directory</h4>
<pre><code>git clone https://github.com/thedevcupid/rasp.git
cd rasp</code></pre>

<h4>2. Initialize Dependencies</h4>
<p>This will rebuild the ignored <code>node_modules/</code> directory.</p>
<pre><code>npm install</code></pre>

<h4>3. Environment Configuration</h4>
<p>Create a <code>.env</code> file in the root directory to store your secure credentials. <b>Never commit this file.</b></p>
<pre><code>BOT_TOKEN=your_secure_token_here
CLIENT_ID=your_client_id_here
PREFIX=!</code></pre>

<h4>4. Economy Initialization</h4>
<p>Ensure <code>economy.json</code> is present in the root directory. If tracking starts fresh, initialize it with an empty object:</p>
<pre><code>{}</code></pre>

<h4>5. Boot Sequence</h4>
<pre><code>node index.js</code></pre>

<hr>

<h3>📡 Command Lexicon</h3>

<table width="100%">
  <tr>
    <th align="left">Command</th>
    <th align="left">Action</th>
    <th align="left">Permissions</th>
  </tr>
  <tr>
    <td><code>/ping</code></td>
    <td>Checks system latency and websocket response.</td>
    <td>Public</td>
  </tr>
  <tr>
    <td><code>/balance</code></td>
    <td>Retrieves current user balance from the economy matrix.</td>
    <td>Public</td>
  </tr>
  <tr>
    <td><code>/status</code></td>
    <td>Displays current uptime and active modules.</td>
    <td>Admin</td>
  </tr>
</table>

<hr>

<div align="center">
  <p>⚠️ <b>Security Notice:</b> The <code>node_modules/</code> and <code>.env</code> files are strictly ignored via <code>.gitignore</code> to prevent token leaks and repository bloat.</p>
  <br>
  <p>Developed by <a href="https://github.com/thedevcupid" style="color: #00ffcc; text-decoration: none;"><b>Zyro</b></a></p>
</div>
