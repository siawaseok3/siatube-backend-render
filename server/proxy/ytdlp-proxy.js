import http from "http";
import net from "net";
import url from "url";
import pkg from "http-proxy";
const { createProxyServer } = pkg;

const proxy = createProxyServer({ changeOrigin: true });

const server = http.createServer((req, res) => {
  proxy.web(req, res, { target: req.url.startsWith("http") ? req.url : `https://${req.headers.host}` }, (err) => {
    console.error("Proxy error:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Proxy error: " + err.message);
  });
});

// HTTPSトンネル用 (CONNECT)
server.on("connect", (req, clientSocket, head) => {
  const { port, hostname } = url.parse(`//${req.url}`, false, true);
  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  serverSocket.on("error", (err) => {
    console.error("Tunnel error:", err);
    clientSocket.end();
  });
});

const PORT = 3007;
server.listen(PORT, () => {
  console.log(`yt-dlp proxy running on port ${PORT}`);
});
