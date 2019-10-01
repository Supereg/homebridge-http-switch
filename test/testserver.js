const http = require('http');
const url = require('url');

let value = false;

module.exports = TestServer;

function TestServer() {
    // TODO maybe make this configurable. However ist currently hardcoded in config.json
    this.port = 8085;
}

TestServer.prototype.start = function () {
    http.createServer(this.handleHTTPCall.bind(this)).listen(this.port);
    console.log("Listening on 8085...");
};

TestServer.prototype.handleHTTPCall = function (request, response) {
    if (request.method !== "GET") {
        response.writeHead(405, {'Content-Type': "text/html"});
        response.write("Method Not Allowed");
        response.end();

        console.log("Someone tried to access the server without an GET request");
        return;
    }

    const parts = url.parse(request.url, true);

    const pathname = parts.pathname.charAt(0) === "/"
        ? parts.pathname.substring(1)
        : parts.pathname;
    const path = pathname.split("/");

    if (path.length === 0) {
        response.writeHead(400, {'Content-Type': "text/html"});
        response.write("Bad Request");
        response.end();

        console.log("Bad Request: " + parts.pathname);
        return;
    }

    switch (path[0]) {
        case "get":
            response.writeHead(200, {'Content-Type': "text/html"});
            response.write(value? "1": "0");
            response.end();

            value = !value;
            break;
        case "on":
            value = true;
            response.writeHead(200, {'Content-Type': "text/html"});
            response.end();
            break;
        case "off":
            value = false;
            response.writeHead(200, {'Content-Type': "text/html"});
            response.end();
            break;
        default:
            response.writeHead(404, {'Content-Type': "text/html"});
            response.write("Not Found");
            response.end();

            console.log("Route not found: " + path[0]);
    }
};
