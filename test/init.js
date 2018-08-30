const spawn = require('child_process').spawn;
const path = require('path');
const fs = require("fs");
const TestServer = require('./testserver');



const server = new TestServer();
server.start();

const pluginPath = path.join(__dirname, "../");
const storagePath = path.join(__dirname, 'homebridge');

const args = `--plugin-path ${pluginPath} --user-storage-path ${storagePath} --debug`; // TODO debug option?; --no-qrcode

const homebridge = spawn('homebridge', args.split(' '), {env: process.env}); // TODO maybe test with hap-nodejs, this method needs homebridge installed globally
homebridge.stderr.on('data', data => {
    console.log(String(data));
});
homebridge.stdout.on('data', data => {
   console.log(String(data));
});

const signals = { 'SIGINT': 2, 'SIGTERM': 15 };
Object.keys(signals).forEach(signal => {
    process.on(signal, () => {
        console.log("Got %s, shutting down tests...", signal);

        console.log("Cleaning up files...");

        deleteDirectorySync(path.join(storagePath, "accessories"));
        deleteDirectorySync(path.join(storagePath, "persist"));

        homebridge.kill("SIGKILL");

        setTimeout(() => {
            process.exit(0);
        });
    });
});

function deleteDirectorySync(pathname) {

    if (fs.existsSync(pathname)) {
        let files = fs.readdirSync(pathname);

        files.forEach(file => {
            const nextPath = path.join(pathname, file);

            if (fs.lstatSync(nextPath).isDirectory())
                deleteDirectorySync(pathname);
            else
                fs.unlinkSync(nextPath);
        });

        fs.rmdirSync(pathname);
    }
}