//###############################################################################
//##
//# Copyright (C) 2014-2015 Andrea Rocco Lotronto
//##
//# Licensed under the Apache License, Version 2.0 (the "License");
//# you may not use this file except in compliance with the License.
//# You may obtain a copy of the License at
//##
//# http://www.apache.org/licenses/LICENSE-2.0
//##
//# Unless required by applicable law or agreed to in writing, software
//# distributed under the License is distributed on an "AS IS" BASIS,
//# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//# See the License for the specific language governing permissions and
//# limitations under the License.
//##
//###############################################################################
  
var WebSocketServer, bindSockets, http, net, url, wst_server_reverse;

WebSocketServer = require('websocket').server;
util = require('util');
http = require('http');
url = require("url");
net = require("net");
bindSockets = require("./bindSockets_reverse");

var eventEmitter = require('events').EventEmitter;

wst_server_reverse = function(tcpListenHost) {
  this.tcpConnections = {};
  this.lastUsedPorts = {};

  this.tcpListenHost = tcpListenHost;
  
  this.httpServer = http.createServer(function(request, response) {
    console.log('Received unhandled request for ' + request.url);
    response.writeHead(404);
    return response.end();
  });
      
  this.wsServerForControll = new WebSocketServer({
    httpServer: this.httpServer,
    autoAcceptConnections: false
    });
}

util.inherits(wst_server_reverse, eventEmitter);

wst_server_reverse.prototype.start = function(port) {

  this.httpServer.listen(port, function() {
    console.log("Server is listening on port %s", port);
  });
  
  this.wsServerForControll.on('request', (function(_this){
    return function(request){
      var uri = url.parse(request.httpRequest.url, true);
      var headers = request.httpRequest.headers;

      if (uri.pathname == '/create') {
        //One TCP Server for each client WS Request
        request.tcpServer = new net.createServer();
        
        var portTcp = headers.port;
        var payload = JSON.parse(headers.payload || "{}")

        if (portTcp == '0') {
          if (headers.hostid && _this.lastUsedPorts[headers.hostid]) {
            portTcp = _this.lastUsedPorts[headers.hostid];
            delete _this.lastUsedPorts[headers.hostid];
            console.log(`Trying to reuse port ${portTcp}`);
          }
        }
        request.tcpServer.listen({port: portTcp, host: _this.tcpListenHost}, () => {
          var address = request.tcpServer.address();
          console.log("Created TCP server on port %s", address.port);
          _this.emit('tunnel-ready', portTcp, address, payload);
        });

        request.wsConnectionForControll = request.accept('tunnel-protocol', request.origin);
        //DEBUG MESSAGE FOR TESTING
        console.log("WS Connection for Control Created");

        request.wsConnectionForControll.on('close', function(reasonCode, description) {
          console.log("WebSocket Controll Peer %s disconnected for: %s", request.wsConnectionForControll.remoteAddress, description);
          var address = request.tcpServer.address();
          request.tcpServer.close();
          if (!address) return;
          _this.lastUsedPorts[headers.hostid] = address.port;
          console.log("Close TCP server on port %s", address.port);
          _this.emit('tunnel-closed', address);
        });

        //Manage TCP Connection
        request.tcpServer.on('connection', (function(_this){
          
          return function(tcpConn){
            tcpConn.wsConnection;
            //Putting in pause the tcp connection waiting the new socket WS Socket for data
            tcpConn.pause();

            console.log("New connection on port %s", request.tcpServer.address().port);
          
            var idConnection = randomIntInc();
            _this.tcpConnections[idConnection] = tcpConn;
            var msgForNewConnection = "NC:"+idConnection;
            
            request.wsConnectionForControll.sendUTF(msgForNewConnection);
          }
        })(_this));

        request.tcpServer.on('error', (error) => {
          console.log("TCP Server error:", error.message);
          request.wsConnectionForControll.close();
        })

      }
      else if (uri.pathname == '/connect') { 
        console.log("Request for Data WS Socket");
        var tcpConn = _this.tcpConnections[headers.id];
        delete _this.tcpConnections[headers.id];
        if (tcpConn) {
          tcpConn.wsConnection = request.accept('tunnel-protocol', request.origin);
          bindSockets(tcpConn.wsConnection,tcpConn);
          tcpConn.resume();
        } else {
          console.log("Unknown connection ID: %s", headers.id);
        }
      }

    }
  })(this));
};

var nextConnectionId = 1000;
function randomIntInc() {
    return nextConnectionId++;
}

module.exports = wst_server_reverse;
