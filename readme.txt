To set up:
- Install nodejs
- In this directory, go:
  > npm update
- Install ngspice
- Install and set up redis (default config on ubuntu will work fine)

To run:
> node app.js

The server will start on port 3000 by default.  To change the port go:
> LISTEN_PORT=<port> node app.js
