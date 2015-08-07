require('./util.js');

var express = require("express");
var bodyParser = require('body-parser');
var child_process = require("child_process");
var fs = require('fs');

var app = express();

app.use(express.static('html'));
app.use(bodyParser.json());

function Simulator(spec) {
	this.spec = spec;
	//~ this.busmap = {};
	this.component_id = 1;
	this.node_id = 1;
	this.models = {};
	this.data_hooks = [];
}

Simulator.prototype.newNodeId = function() {
	return "int"+(this.node_id++);
}

// Convert a list of links into a mapping of buses.
// The returned list is used to map bus ids to a "collapsed" id that is
// identical for buses that are linked together.  For buses not in the
// returned map, the bus id maps to itself by default.
function collapseBuses(links) {
	var map = {};
	for (var i in links) {
		var link = links[i];
		var map2 = {};
		for (var j in link.holes) {
			var bus = link.holes[j];
			var l2 = map[bus] || [bus];
			for(var k in l2) map2[l2[k]] = true;
		}
		var newmap = [];
		for (j in map2) {
			newmap.push(j);
			map[j] = newmap;
		}
	}
	
	for(i in map) { map[i] = map[i][0]; }
	
	return map;
}

function parseSpiceRawFile(data) {
	var map = {};
	var key = "preamble";
	
	data.toString().split("\n").forEach(function(line) {
		var m,s=line;
		if(m = line.match(/^(\w+):(?:\s*)(.*)$/)) {
			key = m[1].toLowerCase();
			s = m[2];
		}
		(map[key] = map[key] || []).push(s);
	});
	
	var keys = [];
	var values = [];
	
	if(!map["values"] || !map["variables"]) return null;
	map["variables"].forEach(function(line) {
		var m = line.match(/^\s+(\d+)\s+v\(([^)]+)\)/);
		if(!m) return;
		keys[m[1]] = m[2];
	});
	var id = 0;
	map["values"].forEach(function(line) {
		var m = line.match(/^(\d+)?\s+(\S+)/);
		if(!m) return;
		if(m[1] !== undefined)
			id = parseInt(m[1]);
		else
			id += 1;
		values[id] = m[2];
	});
	var out = {};
	for (var i in keys)
		if(values[i]) out[keys[i]] = values[i];
	return out;
}

Simulator.prototype.addModel = function(name,data) {
	if(!this.models[name]) this.models[name] = data;
}

Simulator.prototype.dataHook = function(fn) {
	this.data_hooks.push(fn);
}

Simulator.component_functions = {
	resistor: function(data,idx) {	
		var id = this.newComponentId();
		var nodes = this.buses_to_nodes(data.buses);

		nodes.splice(0,0,"R"+id);
		nodes.push(parseFloat(data.value));
		return nodes.join(" ")+"\n";
	},
	diode: function(data,idx) {
		// 0th pin is anode, 1st pin is cathode
		this.addModel('1N914','D(Is=2.52n Rs=.568 N=1.752 Cjo=4p M=.4 Tt=20n)');
		var id = this.newComponentId();
		var nodes = this.buses_to_nodes(data.buses);

		nodes.splice(0,0,"D"+id);
		nodes.push('1N914');
		return nodes.join(" ")+"\n";
	},
	led: function(data,idx) {
		// 0th pin is anode, 1st pin is cathode
		this.addModel('LED','D(Is=1e-22 Rs=6 N=1.5 Cjo=50p)');
		var id = this.newComponentId();
		var nodes = this.buses_to_nodes(data.buses);

		this.dataHook(function() {
			var v = this.voltage(nodes[1],nodes[0]);
			console.log("led v = "+v);
			this.out.components[idx] = {
				lit: v > 1.8
			};
		});
		
		var x = ["D"+id,nodes[0],nodes[1],"LED"];
		return x.join(" ")+"\n";
	}
}

Simulator.instrument_functions = {
	voltage_source: function(data,idx) {
		var id = this.newComponentId();
		var nodes = this.buses_to_nodes(data.buses);
		var x = ["V"+id,nodes[1],nodes[0],data.voltage];
		return x.join(" ")+"\n";
	},
	
	meter: function(data,idx) {
		var id = this.newComponentId();
		var nodes = this.buses_to_nodes(data.buses);
		var value = (data.setting == "V") ? 10e6 : 0.01;
		var x = ["Rmeter"+id,nodes[0],nodes[1],value];

		this.dataHook(function() {
			var v = this.voltage(nodes[0],nodes[1]);
			this.out.instruments[idx] = {
				v: v,
				i: v/value
			};
		});

		return x.join(" ")+"\n";
	}
}

Simulator.prototype.voltage = function(node1,node2) {
	return this.out.voltages[node2] - this.out.voltages[node1];
}

Simulator.prototype.generateNetList = function() {
	var netlist = "circuit\n";
	var supply_ground = null;

	this.busmap = collapseBuses(this.spec.links);

	for(var i in this.spec.components) {
		var cmp = this.spec.components[i];
		var line = Simulator.component_functions[cmp.type].call(this,cmp,i);
		netlist += line;
	}
	for(var i in this.spec.instruments) {
		var inst = this.spec.instruments[i];
		if(!supply_ground && inst.type == "voltage_source")
			supply_ground = this.buses_to_nodes(inst.buses)[0];
		var fn = Simulator.instrument_functions[inst.type];
		if(fn) netlist += fn.call(this,inst,inst.id);
	}
	if(supply_ground)
		netlist += "Rlast 0 "+supply_ground+" 1e-9\n";
	for (var id in this.models) {	
		netlist += ".model "+id+" "+this.models[id]+"\n";
	}
	
	return netlist;
}

Simulator.prototype.buses_to_nodes = function(list) {
	var nodes = [];
	for (var i in list) {
		var id = parseInt(list[i]);
		nodes.push(this.busmap[id] || id);
	}
	return nodes;
}

Simulator.prototype.newComponentId = function() {
	return this.component_id++;
}

Simulator.prototype.run = function(donefunc) {
	var netlist = this.generateNetList();
	netlist += ".op\n";
	netlist += ".end\n";
	
	console.log(netlist);

	var rawfilename = tmpFileName("rawfile");
	console.log("writing to "+rawfilename);

	var spice = child_process.spawn(
		"ngspice",
		['-b','-r',rawfilename],
		{
			env: {
				"SPICE_ASCIIRAWFILE": 1
			}
		}
	);
	spice.stdin.write(netlist);
	spice.stdin.end();

	//~ spice.stdout.on("data",function(data) { console.log(""+data); });

	var that = this;
	spice.on("close",function() {
		try {
			var out = fs.readFileSync(rawfilename);
			fs.unlink(rawfilename);
			var voltages = parseSpiceRawFile(out);
			that.out = {
				voltages: voltages,
				components: {},
				instruments: {}
			};
			
			for(var i in that.data_hooks) {
				var fn = that.data_hooks[i];
				fn.call(that);
			}
			//~ delete that.out.voltages;
			donefunc(that.out);
		} catch(e) {
			donefunc(null);
			console.error("ERRORRRR");
		}
	});
}

app.post('/simulate',function(req,res) {
	var data = req.body;
	new Simulator(data).run(function(result) {
		res.setHeader("Content-Type","application/json");
		res.send(JSON.stringify(result));
	});
});

var port = process.env.LISTEN_PORT || "3000";
port = parseInt(port);

var server = app.listen(port,function() {
	var addr = server.address();
	console.log("Listening on port "+addr.port);
});
