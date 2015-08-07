var hole_pitch = 18;

var breadboard_holes_x = 30;
var breadboard_margin_px = 50;
var holeImg = "hole.png";
var holeSize = 10;

var breadboard_layout = {
	offset: [breadboard_margin_px,breadboard_margin_px],
	size: [
		hole_pitch*(breadboard_holes_x-1)+breadboard_margin_px*2,
		hole_pitch*19+breadboard_margin_px*2
	],
	holes: [
		{
			start: [1,0], step: [0,1], count: 2, sub: {
				step: [1,0], count: breadboard_holes_x-2
			}
		},
		{
			start: [0,4], step: [1,0], count: breadboard_holes_x, sub: {
				step: [0,1], count: 5
			}
		},
		{
			start: [0,11], step: [1,0], count: breadboard_holes_x, sub: {
				step: [0,1], count: 5
			}
		},
		{
			start: [1,18], step: [0,1], count: 2, sub: {
				step: [1,0], count: breadboard_holes_x-2
			}
		}
	]
}

function tidyFloat(v) {
	var units = [
		["G",1e9],
		["M",1e6],
		["K",1e3],
		["",1],
		["m",1e-3],
		["u",1e-6],
		["n",1e-9],
		["p",1e-12],
	]

	for(var i=0;i<units.length;i++) {
		var unit = units[i];
		var ch = unit[0];
		var mult = unit[1];
		var v2 = (v/mult).toFixed(5);
		if(Math.abs(v2) < 1) continue;
		return ((""+v2).substr(0,4).replace(/\.$/,""))+" "+ch;
	}
	return "0";
}

function Desktop(container) {
	if(container === undefined) container = $(document.body);
	this.container = container;
	this.links = [];
	this.components = [];
	this.instruments = {};
	this.next_instrument_id = 1;
	this.next_bus_id = 1;
	this.holeHighlights = [];

	var that = this;
	container.on("mousedown",function(ev) {
		return that.mousedown(this,ev);
	});
}

Desktop.prototype.removeLink = function(link) {
	var idx = this.links.indexOf(link);
	if(idx != -1) this.links.splice(idx,1);
	this.changed();
}

Desktop.prototype.addLink = function(link) {
	this.links.push(link);
}

// Given a jquery event object from an event handler, return the hole
// that the mouse cursor is at/near, or null if there isn't one.
Desktop.prototype.eventToHole = function(ev) {
	return this.offsetToHole([ev.pageX,ev.pageY]);
}

Desktop.prototype.offsetToHole = function(offset) {
	var inst = this.instrumentAtOffset(offset);
	if(!inst) return null;

	var instofs = inst.hole_layer.offset();
	var pos = [ offset[0]-instofs.left, offset[1]-instofs.top ];
	return inst.holeAtOffset(pos);
}

Desktop.prototype.instrumentAtOffset = function(offset) {
	for(var i in this.instruments) {
		// XXX do a bounds check
		var inst = this.instruments[i];
		//~ if(!inst) continue;
		//~ if(inst.constructor !== Breadboard) continue;
		var el = inst.el;
		var ofs = el.offset();
		if(offset[0] < ofs.left) continue;
		if(offset[0] > ofs.left + el.innerWidth()) continue;
		if(offset[1] < ofs.top) continue;
		if(offset[1] > ofs.top + el.innerHeight()) continue;
		return inst;
	}
	return null;
}

// Calculate the pixel offset of the center of a hole.
// this offset is relative to the desktop element.
Desktop.prototype.holeOffset = function(hole) {
	var offset = hole.instrument.hole_layer.offset();
	return [ hole.pos[0] + offset.left, hole.pos[1] + offset.top ];
}

Desktop.prototype.newInstrumentId = function() {
	return this.next_instrument_id++;
}

Desktop.prototype.newInstrument = function(instrument) {
	this.instruments[instrument.id] = instrument;
}

Desktop.prototype.removeInstrument = function(instrument) {
	this.instruments[instrument.id] = null;
}

Desktop.prototype.mousedown = function(el,ev) {
	this.unselectComponent();
	var hole = this.eventToHole(ev);
	if(!hole) return false;

	if(hole.component) {
		if(hole.component instanceof LinkWire) {
			// XXX Remove link wire from component list, to be added later
			// (maybe)
			hole.component.drag_start(hole.component_pin);
		}
		return false;
	}
	
	LinkWire.start_create(hole);
	return false;
}

Desktop.prototype.addComponent = function(component) {
	this.components.push(component);
}

Desktop.prototype.removeComponent = function(component) {
	if(this.selected_component == component) this.unselectComponent();
	var idx = this.components.indexOf(component);
	if(idx != -1) this.components.splice(idx,1);
	component.remove();
}

Desktop.prototype.component_shortcut = function(el,ev) {
	var cmp = this.selected_component;
	var type = ev.target.nodeName.toLowerCase();
	if(type == "input" || type == "textarea") return true;
	if(ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey)
		return true;
	switch(ev.charCode) {
	case 'r'.charCodeAt():
	case 'R'.charCodeAt():
		cmp.float(2,window.last_mousemove);
		cmp.rotate();
		return false;
	case 'm'.charCodeAt():
	case 'M'.charCodeAt():
		cmp.float(2,window.last_mousemove);
		return false;
	}
	return true;
}

Desktop.prototype.selectComponent = function(component) {
	this.unselectComponent();
	this.selected_component = component;
	component.markSelected();
	$(".help-box").removeClass("invisible");
	var table = this.propertyTableFor(component);
	var div = $("div.property-table");
	div.html(table);
	var box = $(".property-box");
	this.property_box = box;
	box.removeClass("invisible");
	var typename = component.spec.typename || "";
	$(".component-type",box).text(typename);
	$(".component-name",this.property_box).text(component.name);
	var that = this;
	$(document.body).on("keypress.for_selected_element",function(ev) {
		return that.component_shortcut(this,ev);
	});
}

Desktop.prototype.unselectComponent = function() {
	if(!this.selected_component) return;
	this.selected_component.markUnselected();
	this.selected_component = null;
	$(".help-box").addClass("invisible");
	var box = $(".property-box");
	box.addClass("invisible");
	var div = $("div.component-table",box);
	div.empty();
	$(document.body).off(".for_selected_element");
}

Desktop.prototype.propertyRowFor = function(component,spec) {
	var str = '<tr><td class=property-name>'+spec.name+
		'</td><td class=property-value></td>';
	var el = $(str);
	var value_el = $(".property-value",el);
	if(spec.type == "text") {
		var input = $("<input type=text>");
		value_el.append(input);

		var that = this;
		var fn = function() {
			spec.setter.call(component,input.val(),value_el);
			input.blur();
			that.changed();
			return false;
		};
		
		input.on("change",fn);
		input.on("keydown",function(ev) {
			if(ev.keyCode != 13) return true;
			input.blur();
			return true;
		});
		spec.getter.call(component,value_el);
	} else {
		console.error("unknown property type \""+spec.type+"\"");
		return null;
	}
	return el;
}

Desktop.prototype.propertyTableFor = function(component) {
	var rows = [
		this.propertyRowFor(component,{
			name: "name",
			type: "text",
			getter: function(el) { this.getName(el); },
			setter: function(val,el) {
				this.setName(val,el);
				$(".component-name",this.property_box).text(val);
			},
		})
	];
	var properties = component.spec.properties;
	var that = this;
	component.spec.properties.forEach(function(property) {
		rows.push(that.propertyRowFor(component,property));
	});
	var table = $("<table class=property-table>");
	table.append(rows);
	return table;
}

// Return a map of all of the components on the board, keyed by the
// lowercased name.
// XXX keep track of this map rather than generate it here.
Desktop.prototype.componentsByName = function() {
	var map = {};
	this.components.forEach(function(component) {
		if(component.name)
			map[component.name.toLowerCase()] = component;
	});
	return map;
}

Desktop.prototype.newComponentName = function(prefix) {
	var map = this.componentsByName();
	for(var i=1;i<10000;i++) {
		var str = prefix + i;
		if(!map[str.toLowerCase()]) return str;
	}
	return null; // How the hell did we get here?
}

Desktop.prototype.resetHoleHighlights = function() {
	this.holeHighlights.forEach(function(hole) {
		hole.unhighlight(true);
	});
	this.holeHighlights = [];
}

Desktop.prototype.newBus = function() {
	return this.next_bus_id++;
}

Desktop.prototype.serialize = function() {
	var that = this;
	var components = [];
	var state = {
		instruments: Object.keys(this.instruments).map(function(id) {
			return that.instruments[id].serialize();
		}),
		links: this.links.map(function(link) { return link.serialize(); }),
		components: this.components.map(function(cmp) { return cmp.serialize(); }),
	};
	return state;
}

Desktop.prototype.simulate = function() {
	this.unselectComponent();
	var data = desktop.serialize();

	var simulator = new Simulator(this,data);
	var that = this;
	simulator.then(function(results) {
		if(results.components) {
			for(var i in results.components) {
				that.components[i].result(results.components[i]);
			}
		}
		if(results.instruments) {
			for(var i in results.instruments) {
				that.instruments[i].result(results.instruments[i]);
			}
		}
	});
	return simulator;
}

Desktop.prototype.on = function() {
	var jq = $(this);
	return jq.on.apply(jq,arguments);
}

Desktop.prototype.changed = function() {
	$(this).trigger("change");
}

// Resets anything displayed as a result of a simulation
Desktop.prototype.reset = function() {
	for(var k in this.instruments) {
		var inst = this.instruments[k];
		inst.reset();
	}
	this.components.forEach(function(cmp) { cmp.reset(); });
}

function Simulator(desktop,circuit_data) {
	this.deferred = $.Deferred();
	
	this.ajax = $.ajax("/simulate",{
		type: "POST",
		data: JSON.stringify(circuit_data),
		contentType: "application/json"
	});
	var that = this;
	// XXX is there a neater way to do this?
	this.ajax.then(function(data) {
		if(data)
			that.deferred.resolveWith(that,[data]);
		else
			that.deferred.rejectWith(that,["spice"]);
	},function(xhr,status,error) {
		that.deferred.rejectWith(that,["req"]);
	});
}

Simulator.prototype.then = function() {
	return this.deferred.then.apply(this.deferred,arguments);
}

Simulator.prototype.cancel = function() {
	this.ajax.abort();
};

function Instrument(desktop,type,state) {
	this.desktop = desktop;
	this.id = desktop.newInstrumentId();
	this.type = type;
	desktop.newInstrument(this);
}

Instrument.prototype.addHoles = function(spec) {
	var that = this;
	this.holes = [];
	spec.forEach(function(pos) {
		var hole = new Hole(that,pos);
		hole.bus = that.desktop.newBus();
		that.holes.push(hole);
	});
}

Instrument.prototype.holeAtOffset = function(pos) {
	var that = this;
	// This should technically be holeSize*0.5 but some play is nice.
	var r = holeSize;
	for(var i=0;i<this.holes.length;i++) {
		var hole = this.holes[i];
		if(Math.abs(hole.pos[0]-pos[0]) <= r && Math.abs(hole.pos[1]-pos[1]) <= r)
			return hole;
	}
	return null;
}

Instrument.prototype.serialize = function() {
	var data = { id: this.id, type: this.type };
	if(this.holes) {
		data.buses = this.holes.map(function(hole) { return hole.bus; });
	}
	if(this.properties) {
		for(var k in this.properties) data[k] = this.properties[k];
	}
	return data;
}

Instrument.prototype.result = function(data) {} // default to ignore

Instrument.prototype.reset = function() {};

function Breadboard(desktop,state) {
	Instrument.call(this,desktop,"breadboard",state);

	this.layout = breadboard_layout;
	this.hole_origin = breadboard_layout.offset;
	this.holeGrid = [];

	var el = this.el = $("<div class=breadboard>");
	desktop.container.append(el);

	el.css({
		width: px(breadboard_layout.size[0]),
		height: px(breadboard_layout.size[1]),
	});
	if(state) {
		el.css({
			left: state.offset[0],
			top: state.offset[1]
		});
	}

	// These are in reverse order of z-index
	(this.board_layer = $('<div class=board-layer>')).appendTo(this.el);
	(this.component_layer = $('<div class=board-layer>')).appendTo(this.el);
	this.hole_layer = this.component_layer;

	var holes = this.layout.holes;
	for (var i in holes) {
		var set = holes[i];
		this.addSet(set);
	}
}

Breadboard.base(Instrument);

Breadboard.prototype.offsetToHolePos = function(pos) {
	return [
		Math.floor((pos[0]-this.hole_origin[0])/hole_pitch+0.5),
		Math.floor((pos[1]-this.hole_origin[1])/hole_pitch+0.5)
	];
};

Breadboard.prototype.holeAtGridPos = function(pos) {
	return this.holeGrid[pos[1]] && this.holeGrid[pos[1]][pos[0]];
}

Breadboard.prototype.holeById = function(id) {
	return this.holeAtGridPos(id);
}

Breadboard.prototype.holeAtOffset = function(pos) {
	var holepos = this.offsetToHolePos(pos);
	return this.holeAtGridPos(holepos);
}

Breadboard.prototype.holePos = function(pos) {
	var x = pos[0];
	var y = pos[1];
	return [
		this.hole_origin[0] + x * hole_pitch,
		this.hole_origin[1] + y * hole_pitch
	];
}

Breadboard.prototype.addHole = function(bus,pos) {
	var ofs = this.holePos(pos);
	var hole = new Hole(this,ofs);
	hole.bus = bus;
	hole.grid_pos = pos;
	(this.holeGrid[pos[1]] = this.holeGrid[pos[1]] || [])[pos[0]] = hole;
}

Breadboard.prototype.addSet = function(set) {
	var cur = set.start.slice();
	if(set.sub) {
		var sub = {
			step: set.sub.step,
			count: set.sub.count,
			start: cur
		};
		for (var i=0;i<set.count;i++) {
			this.addSet(sub);
			cur[0] += set.step[0];
			cur[1] += set.step[1];
		}
		return;
	}

	var bus = this.desktop.newBus();
	var svg = $("<svg>");
	var path = $("<path>");
	var c = set.count-1;
	var dx = set.step[0];
	var dy = set.step[1];

	// Bus indicator
	svg.attr({
		width: (dx * c * hole_pitch + 20),
		height: (dy * c * hole_pitch + 20)
	});
	var holepos = this.holePos(cur);
	svg.css({
		left: px(holepos[0]-10),
		top: px(holepos[1]-10),
		position: "absolute"
	});
	path.attr({
		d: "M 10 10 L "+ (dx*c*hole_pitch+10) + " " + (dy*c*hole_pitch+10) + " ",
		stroke: "#ddd",
		'stroke-width': 3
	});
	svg.append(path);

	// Creating SVGs like above doesn't work; this works around that
	var div = $("<div>").append(svg); svg = $(div.html());
	this.board_layer.append(svg);

	bus.start = cur.slice();
	for (var i=0;i<set.count;i++) {
		this.addHole(bus,cur);
		bus.end = cur.slice();
		cur[0] += dx;
		cur[1] += dy;
	}
}

function breadsim_init() {
}

function Hole(instrument,spec) {
	var pos;
	if(spec.pos === undefined) {
		pos = spec;
		spec = {
			pos: pos,
			size: [holeSize,holeSize],
			src: holeImg
		}
	} else {
		pos = spec.pos;
	}
	var img = $("<img>");
	img.attr({
		src: spec.src,
		class: "positioned",
		width: spec.size[0],
		height: spec.size[1]
	});
	img.css({
		left: Math.floor(pos[0] - spec.size[0] * 0.5),
		top: Math.floor(pos[1] - spec.size[1] * 0.5)
	});
	instrument.hole_layer.append(img);
	this.instrument = instrument;
	this.el = img;
	this.pos = pos;
	return this;
}

Hole.prototype.highlight = function() {
	if(this.highlight_el) return;
	
	var rad = 7;

	var el = $("<svg>");
	var pos = this.el.position();
	el.css({position:"absolute",left:pos.left+holeSize*0.5,top:pos.top+holeSize*0.5});
	//~ el.css({position:"absolute",left:pos.left,top:pos.top});
	el.attr({width:1,height:1,overflow:"visible"});
	var circle = $("<circle>");
	circle.attr({
		cx:0,
		cy:0,
		r:rad,
		"fill": "rgba(255,60,60,0.5)"
	});
	el.append(circle);
	
	var div = $("<div>");
	div.append(el);
	el = this.highlight_el = $(div.html());

	this.instrument.hole_layer.append(el);
	this.instrument.desktop.holeHighlights.push(this);
}

Hole.prototype.unhighlight = function(from_board) {
	if(from_board === undefined) from_board = false;
	var highlight = this.highlight_el;
	if(!highlight) return;
	highlight.remove();
	this.highlight_el = null;
	if(!from_board) {
		var arr = this.instrument.desktop.holeHighlights;
		var idx = arr.indexOf(this);
		if(idx == -1) {
			console.log("can't find hole to unlighlight!");
			return;
		}
		arr.splice(idx,1);
	}
}

Hole.prototype.linkTo = function(component,pin) {
	this.component = component;
	this.component_pin = pin;
}

Hole.prototype.desktopOffset = function() {
	var ofs1 = this.instrument.hole_layer.offset();
	var ofs2 = this.instrument.desktop.container.offset();
	return [
		this.pos[0] + ofs1.left - ofs2.left,
		this.pos[1] + ofs1.top - ofs2.top,
	];
}

function Part() {}

function LinkWire(hole1,hole2) {
	this.pins = [hole1,hole2];
	hole1.linkTo(this,0);
	this.desktop = hole1.instrument.desktop;
	this.color = hole1.link_color || "#448844";
	if(hole2) hole2.linkTo(this,1);
}

LinkWire.base(Part);

LinkWire.start_create = function(hole) {
	var linkwire = new LinkWire(hole,null);
	linkwire.drag_start(1);
}

LinkWire.prototype.drag_start = function(pinno) {
	var other = this.pins[1-pinno];

	if(this.pins[pinno]) this.desktop.changed();
	
	this.drag_pin = pinno;
	var that = this;
	// XXX use grabber for these
	
	this.desktop.container.on("mousemove.link_drag",function(ev) {
		return that.drag_move(ev);
	});
	$(document).on("mouseup.link_drag",function(ev) {
		that.drag_end(ev);
		return false;
	});
}

LinkWire.prototype.drag_move = function(ev) {
	var hole1 = this.pins[1-this.drag_pin];
	var pos1 = hole1.desktopOffset();
	var offset = this.desktop.container.offset();
	var pos2 = [ ev.pageX-offset.left, ev.pageY-offset.top ];
	this.draw_element(pos1,pos2);
}

LinkWire.prototype.drag_end = function(ev) {
	// XXX have this function work off a previous event rather
	// than calculate position again.
	var hole1 = this.pins[1-this.drag_pin];
	var pos1 = hole1.desktopOffset();

	var hole = this.desktop.eventToHole(ev);

	this.desktop.container.off("mousemove.link_drag");
	$(document).off("mouseup.link_drag");
	
	this.desktop.removeLink(this);

	if(this.element) this.element.detach();
	this.element = null;
	if (this.pins[0]) this.pins[0].component = null;
	if (this.pins[1]) this.pins[1].component = null;

	if(hole) {
		if(hole.component) hole = this.pins[this.drag_pin];
		if(!hole) return null;
		var pos2 = hole.desktopOffset();
		this.pins[this.drag_pin] = hole;

		this.pins[0].linkTo(this,0);
		this.pins[1].linkTo(this,1);

		this.draw_element(pos1,pos2);
		this.desktop.addLink(this);
		return this;
	}
	
	return null;
}

LinkWire.prototype.draw_element = function(pos1,pos2) {
	if(this.element) this.element.detach();
	var el = this.element = $("<svg>");
	var size = [Math.abs(pos2[0]-pos1[0]),Math.abs(pos2[1]-pos1[1])];
	var pos = [Math.min(pos1[0],pos2[0]),Math.min(pos1[1],pos2[1])];
	el.css({
		position:"absolute",
		left:pos[0],
		top:pos[1],
		overflow: "visible"
	});
	el.attr({width:1,height:1});
	var d = [
		"m",pos1[0]-pos[0],pos1[1]-pos[1],
		"l",pos2[0]-pos1[0],pos2[1]-pos1[1]
	].join(" ");
	var path = $("<path>");
	path.attr({d:d,"stroke":this.color,"stroke-width":5});
	el.append(path);
	
	var div = $("<div>");
	div.append(el);
	el = $(div.html());
	this.desktop.container.append(el);
	//~ $(document.body).append(el);
	this.element = el;
}

LinkWire.prototype.serialize = function() {
	return {
		color: this.color,
		holes: [ this.pins[0].bus, this.pins[1].bus ]
	};
}

function Meter(desktop,state) {
	Instrument.call(this,desktop,"meter",state);

	var el = $("#templates .meter").clone();
	var valuebox = $(".value-display",el);
	valuebox.text("");
	this.valuebox = valuebox;
	
	if(state) {
		el.css({
			left: state.offset[0],
			top: state.offset[1]
		});
	}
	
	var btn = $(".setting-button button",el);
	var that = this;
	btn.on("click",function() {
		var newsetting = (that.properties.setting == "V") ? "A": "V";
		that.properties.setting = newsetting;
		btn.text(" "+newsetting+" ");
		that.valuebox.text("");
		that.desktop.changed();
	});
	
	
	this.desktop = desktop;
	this.el = el;
	this.hole_layer = $(".hole-layer",el);
	this.properties = { setting: state.setting || "V" };
	this.addHoles([
		{ pos: [42,129], size: [16,16], src: "circle-black.svg" },
		{ pos: [113,129], size: [16,16], src: "circle-red.svg" }
	]);
	this.holes[0].link_color = "#222";
	this.holes[1].link_color = "#C93535";
	desktop.container.append(el);
};

Meter.base(Instrument);

Meter.prototype.result = function(data) {
	
	if(this.properties.setting == "V") {
		this.valuebox.text(tidyFloat(data.v) + "V");
	} else {
		this.valuebox.text(tidyFloat(data.i) + "A");
	}
};

Meter.prototype.reset = function() {
	this.valuebox.text("");
}

function VoltageSource(desktop,state) {
	Instrument.call(this,desktop,"voltage_source",state);
	var el = $("#templates .voltage-source").clone();
	var valuebox = $(".value-display",el);
	var slider = $(".slider",el).slider({
		value: 10,
		min: 0,
		max: 30,
		step: 0.2,
	});
	var that = this;
	slider.on("slide",function(ev,ui) {
		//~ log("slide to "+ui.value);
		that.properties.voltage = ui.value;
		that.updateDisplay();
	});

	this.valuebox = valuebox;
	
	if(state) {
		el.css({
			left: state.offset[0],
			top: state.offset[1]
		});
	}
	
	this.desktop = desktop;
	this.el = el;
	this.hole_layer = $(".hole-layer",el);
	this.properties = { voltage: state.voltage || 10 };
	
	$(".buttons",el).buttonset();

	this.updateDisplay();

	this.addHoles([
		{ pos: [50,160], size: [16,16], src: "circle-black.svg" },
		{ pos: [190,160], size: [16,16], src: "circle-red.svg" }
	]);
	this.holes[0].link_color = "#222";
	this.holes[1].link_color = "#C93535";
	desktop.container.append(el);
}

VoltageSource.base(Instrument);

VoltageSource.prototype.updateDisplay = function() {
	var v = this.properties.voltage;
	this.valuebox.text((v.toFixed(1)) + " V");
}

function Component(desktop,spec,state) {
	var img = $("<img>");
	var el = $("<div class=component>");
	var highlight = $("<div class=component-highlight>");
	el.append(img);
	el.append(highlight);
	this.el = el;
	this.img = img;
	this.highlight = highlight;
	this.float_state = 0;
	this.spec = spec;
	this.desktop = desktop;
	desktop.addComponent(this);
	this.pins = []; // Links to holes, indexed by pin no
	
	var that = this;
	el.on("mousedown",function(ev) {
		that.desktop.selectComponent(that);
		that.float(1,ev);
		return false;
	});
		
	if(state) {
		this.board = desktop.instruments[state.instrument];
		this.pos = state.pos;  // In hole grid coords
		this.parameters = state.parameters;
		this.orientation = data.orientation;
		this.properties = state.properties;
		el.appendTo(desktop.container);
		this.redraw();
	} else {
		this.board = null;
		this.pos = null;
		this.parameters = null;
		this.orientation = 0;
		this.properties = {};
		this.name = desktop.newComponentName(spec.name_prefix);
		for (var i in spec.properties) {
			var prop = spec.properties[i];
			this.properties[prop.name] = prop.default;
		}
	}
}

Component.base(Part);

Component.icon = function(board,component_layer) {}

Component.prototype.result = function(data) {} // default to ignore

Component.prototype.rotated_data = function(orientation) {
	var data;
	if(orientation === undefined) orientation = this.orientation;
	if(this.spec.orientations) {
		var img = this.spec.orientations[orientation];
		data = {
			url: img.url,
			css: img.css,
			origin: img.origin,
			size: img.size
		};
	} else {
		var img = this.spec.image;
		var m = Matrix.rotate(orientation * Math.PI/2);
		var size = m.apply(img.size);
		var origin = m.apply(img.origin);
		data = {
			url: img.url,
			css: {
				"transform": "rotate("+(orientation*90)+"deg)",
				"transform-origin": "0 0"
			},
			size: size,
			origin: origin
		};
	}
	return data;
}

// Detach the component from the board and pin it to the pointer.
// This is done by intercepting the mouse drag and click events.
Component.prototype.float = function(float_state,ev) {
	if(this.float_state != 0) return;
	var that = this;
	// 1 = mouse relaese stops, 2 = mouse click stops
	float_state = float_state ? float_state : 2;

	if(float_state == "aafbbdd75606244f") console.log(this);
	
	this.float_state = float_state;
	this.el.detach().appendTo($(document.body));

	if(this.el.get(0) === ev.delegateTarget) {
		var hotspot = Matrix.rotate(this.orientation*Math.PI/2)
			.apply(point(ev.offsetX,ev.offsetY));
	} else {
		var imgdata = this.rotated_data(this.orientation);
		hotspot = point(imgdata.size[0]/2,imgdata.size[1]/2);
	}
	
	this.prev_state = {
		board: this.board,
		pos: this.pos,
		orientation: this.orientation
	};
	
	this.drag_hotspot = hotspot;
	var grabber = this.grabber = new Grabber;
	grabber.mousemove = function(ev) { that.drag_move($(this),ev); };
	grabber.mouseup = function(ev) { that.drag_mouseup($(this),ev); }
	grabber.mousedown = function(ev) { that.drag_mousedown($(this),ev); }
	grabber.keydown = function(ev) { that.drag_keypress($(this),ev); };
	
	if(ev) this.drag_move(null,ev);
	this.desktop.changed();
}

Component.prototype.drag_move = function(el,ev) {
	this.drag_pos = [
		ev.pageX-this.drag_hotspot[0],
		ev.pageY-this.drag_hotspot[1]
	];
	this.redraw();
}

Component.prototype.unfloat = function() {
	if(this.float_state == 0) return;
	this.float_state = 0;
	this.grabber.release();
	this.desktop.resetHoleHighlights();
	this.highlight_def = "";
	this.unlink_pins();

	var newholes = this.getHoles();
	if(!newholes) {
		if(!this.prev_state.pos || !this.board || !this.el.overlaps(this.board.el)) {
			this.desktop.removeComponent(this);
			return;
		}
		for (var k in this.prev_state) this[k] = this.prev_state[k];
		newholes = this.getHoles();
	}
	if(!newholes) {
		alert('newholes is null?');
	}
	for(var i=0;i<newholes.length;i++) {
		this.pins[i] = newholes[i];
		newholes[i].linkTo(this,i);
	}
	//~ this.el.detach().appendTo(this.board.component_layer);
	this.el.detach().appendTo(this.desktop.container);
	this.redraw();
}

Component.prototype.unlink_pins = function() {
	this.pins.forEach(function(pin) { pin.component = null; });
	this.pins = [];
}

Component.prototype.remove = function() {
	this.unlink_pins();
	this.el.remove();
}

Component.prototype.drag_mouseup = function(el,ev) {
	if(this.float_state == 1) this.unfloat();
}

Component.prototype.drag_mousedown = function(el,ev) {
	if(this.float_state == 2) this.unfloat();
}

Component.prototype.drag_keypress = function(el,ev) {
	var key = ev.which;
	if(key == 82) { // 'r'
		this.rotate();
		return;
	}
}

Component.prototype.rotate = function() {
	if(this.float_state == 0) this.float();
	this.orientation = (this.orientation+1) % 4;
	var data = this.rotated_data();
	var old_hotspot = this.drag_hotspot;
	this.drag_hotspot = point(data.size[0]/2, data.size[1]/2);
	// Recalculate drag position. argh.
	this.drag_pos = point(
		this.drag_pos[0] + old_hotspot[0] - this.drag_hotspot[0],
		this.drag_pos[1] + old_hotspot[1] - this.drag_hotspot[1]
	);
	this.redraw();
}

Component.prototype.redraw = function() {
	var imgdata = this.rotated_data();
	this.img.attr("src",imgdata.url);
	var pos;
	if(this.float_state) {
		pos = this.drag_pos;
	} else {
		if(!this.pos || !this.board) return;
		pos = this.board.holeAtGridPos(this.pos).desktopOffset();
		//~ pos = this.board.holePos(this.pos);
		var data = this.rotated_data();
		pos[0] -= data.origin[0];
		pos[1] -= data.origin[1];
		this.el.css("opacity","");
	}
	this.el.css({ top: pos[1], left: pos[0] });
	this.el.css(imgdata.css);

	if(!this.float_state) return;

	var origin = point(
		this.drag_pos[0]+imgdata.origin[0],
		this.drag_pos[1]+imgdata.origin[1]
	);
	var board = this.desktop.instrumentAtOffset(origin);
	var board_id = -1;
	var grid_origin = [0,0];
	if(board && board instanceof Breadboard) {
		board_id = board.id;
		var ofs = board.hole_layer.offset();
		var board_pos = [ origin[0] - ofs.left, origin[1] - ofs.top ];
		grid_origin = board.offsetToHolePos(board_pos);
		this.pos = grid_origin;
	} else {
		board = null;
	}
	this.board = board;

	// This produces a string that is unique to any position/orientation of
	// the component.
	// When it changes we must re-calculate the positions of the pins
	// And update highlights and such.
	var def = [
		board_id,grid_origin[0],grid_origin[1],this.orientation
	].join(" ");
	var prev_def = this.highlight_def;
	this.highlight_def = def;
	if(def == prev_def) return;

	// Update highlights of holes
	var holes = this.getHoles();
	if(holes) {
		this.el.css("opacity","");
		holes.forEach(function(hole) { hole.highlight(); });
	} else {
		this.el.css("opacity","0.5");
	}
}

Component.prototype.markSelected = function() {
	this.selected = true;
	this.highlight.css("visibility","visible");
	//~ this.redraw();
}

Component.prototype.markUnselected = function() {
	this.selected = false;
	this.highlight.css("visibility","");
	//~ this.redraw();
}

// Given the current grid_origin and oreientation, get an ordered list of
// the holes "at" the pins.  Returns null if any pins aren't over a hole.
Component.prototype.getHoles = function() {
	var holes = [];
	var mtx = Matrix.rotate(this.orientation * Math.PI*0.5);
	// XXX This shouldn't be done here... (what was I thinking?)
	this.desktop.resetHoleHighlights();
	if(!this.board || !this.pos) return null;
	var board = this.board;
	var origin = this.pos;
	
	for(var i=0;i<this.spec.pins.length;i++) {
		var pin = this.spec.pins[i];
		var pos = mtx.apply(pin);
		var gridpos = point(
			Math.round(pos[0]+origin[0]),
			Math.round(pos[1]+origin[1])
		);
		var hole = board.holeAtGridPos(gridpos);
		if(!hole) return null;
		if(hole.component && hole.component !== this) return null;
		holes[i] = hole;
	}
	return holes;
}

Component.prototype.getName = function(el) {
	$("input",el).val(this.name);
}

Component.prototype.setName = function(val,el) {
	var map = this.desktop.componentsByName();
	var other = map[val.toLowerCase()];
	if(!other || other === this) {
		this.name = val;
		return;
	}
	alert("There is already a component named \""+val+"\".");
	$("input",el).val(this.name);
}

Component.prototype.serialize = function() {
	var data = {
		type: this.spec.type,
		buses: this.pins.map(function(hole) { return hole.bus; })
	}
	for(var k in this.properties) data[k] = this.properties[k];
	return data;
}

Component.prototype.reset = function() {};

function Resistor(desktop,state) {
	Component.call(this,desktop,Resistor.spec,state);
}

Resistor.base(Component);

Resistor.icon = function() {
	var img = $("<img>");
	img.attr("src", Resistor.spec.image.url);
	return img;
}

Resistor.spec = {
	type: "resistor",
	name_prefix: "R",
	pins: [ point(0,0),point(3,0) ],
	image: {
		url: "resistor-generic.png",
		origin: point(3,8),
		size: point(61,16)
	},
	properties: [
		{
			name: "value",
			type: "text",
			getter: function(el) { $("input",el).val(this.properties.value); },
			setter: function(val,el) { this.properties.value = parseFloat(val); },
			default: 100
		}
	]
};

function Diode(desktop,state) {
	Component.call(this,desktop,Diode.spec,state);
}

Diode.base(Component);

Diode.icon = function() {
	var img = $("<img>");
	img.attr("src", Diode.spec.image.url);
	return img;
}

Diode.spec = {
	type: "diode",
	typename: "1N914",
	name_prefix: "D",
	pins: [ point(0,0),point(3,0) ],
	image: {
		url: "diode-generic.png",
		origin: point(3,8),
		size: point(61,16)
	},
	properties: []
};

function Led(desktop,state) {
	Component.call(this,desktop,Led.spec,state);
}

Led.base(Component);

Led.icon = function() {
	var img = $("<img>");
	img.attr("src", Led.spec.image.url);
	return img;
}

Led.spec = {
	type: "led",
	name_prefix: "D",
	pins: [ point(0,0),point(1,0) ],
	image: {
		url: "led-5mm-red.png",
		url_lit: "led-5mm-red-lit.png",
		origin: point(3,11),
		size: point(26,22)
	},
	properties: []
};

Led.prototype.rotated_data = function() {
	var data = Component.prototype.rotated_data.call(this);
	data.url = this.lit ? this.spec.image.url_lit : this.spec.image.url;
	return data;
}

Led.prototype.result = function(data) {
	this.lit = data.lit;
	this.redraw();
}

Led.prototype.reset = function() {
	delete this.lit;
	this.redraw();
};
