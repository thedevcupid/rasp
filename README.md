<div align="center">

  <!-- HEADER BANNER -->
  <img src="https://capsule-render.vercel.app/api?type=rect&color=0:000000,100:0d1117&height=150&text=Raspbot&fontSize=60&fontColor=00ffcc&fontAlignY=50" alt="Raspbot Banner" width="100%" />

  <br><br>

  <p>
    <b>Automating the network, one command at a time.</b>
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
  Raspbot is a custom-built automation engine designed for seamless interaction and server management. Built on a lightweight Node.js architecture, it provides rapid response times and scalable command modularity.
</p>

<br>

<h3>🛠️ Core Features</h3>
<ul>
  <li><b>Modular Command Handler:</b> Easily add or modify commands without disrupting core operations.</li>
  <li><b>Automated Response System:</b> High-speed processing for real-time interaction.</li>
  <li><b>Secure Environment:</b> Token and configuration variables are strictly sandboxed.</li>
</ul>

<hr>

<h3>💻 Installation & Deployment</h3>

<h4>1. Clone the Directory</h4>
<pre><code>git clone https://github.com/thedevcupid/raspbot.git
cd raspbot</code></pre>

<h4>2. Initialize Dependencies</h4>
<pre><code>npm install</code></pre>

<h4>3. Environment Configuration</h4>
<p>Create a <code>.env</code> file in the root directory to store your secure credentials. <b>Never commit this file.</b></p>
<pre><code>BOT_TOKEN=your_secure_token_here
CLIENT_ID=your_client_id_here
PREFIX=!</code></pre>

<h4>4. Boot Sequence</h4>
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
    <td><code>/status</code></td>
    <td>Displays current uptime and active modules.</td>
    <td>Admin</td>
  </tr>
</table>

<hr>

<div align="center">
  <p>⚠️ <b>Security Notice:</b> Do not expose your <code>.env</code> variables. If deploying to a VPS, ensure your firewall rules are properly configured to allow necessary webhook traffic.</p>
  <br>
  <p>Developed by <a href="https://github.com/thedevcupid" style="color: #00ffcc; text-decoration: none;"><b>Zyro</b></a></p>
</div>
