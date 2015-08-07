function units(d,u) { return("" + d + u); }
function px(d) { return units(d,"px"); }

Function.prototype.base = function(B) {
	var x = function() {}; x.prototype = B.prototype;
	this.prototype = new x();
	this.prototype.constructor = this;
}

function Point(x,y) {
	this[0] = x;
	this[1] = y;
}

Point.prototype = new Array(0,0);

// A representation of a 2D (3x3) matrix.  This is conceptually an
// homongenous matrix but assumes that the bottom row is [0 0 1] and so does
// not store it.
Matrix = function(x) {
	if(x) for(var i=0;i<6;i++) this[i] = x[i];
}

Matrix._identity = new Array(
	1,0,0,
	0,1,0
);

Matrix.rotate = function(angle) {
	var c = Math.cos(angle);
	var s = Math.sin(angle);
	return new Matrix([
		 c,-s, 0,
		 s, c, 0
	]);
}

Matrix.prototype = Matrix._identity;

Matrix.prototype.apply = function(v) {
	// This assumes the bottom row is (0,0,1)
	// This is true for all the matrices we will ever use.
	var out = new Point();
	out[0] = this[0] * v[0] + this[1]*v[1] + this[2];
	out[1] = this[3] * v[0] + this[4]*v[1] + this[5];
	return out;
}

function point(x,y) { return new Point(x,y); }

///////////////////////////////////////////////////////////////////////////
// This class (and the .grabber css style) knows how to "grab" the mouse
// and keyboard, to divert events away from the normal page and create a "mode"
Grabber = function() {
	var that = this;
	var grabber = $("<div class=grabber>");
	grabber.appendTo($(document.body));
	grabber.on("mousemove.grabber",function(ev) {
		if(that.mousemove) that.mousemove(ev);
		return false;
	});
	grabber.on("mouseup.grabber",function(ev) {
		if(that.mouseup) that.mouseup(ev);
		return false;
	});
	grabber.on("mousedown.grabber",function(ev) {
		if(that.mousedown) that.mousedown(ev);
		return false;
	});
	grabber.on("click.grabber",function(ev) {
		if(that.click) that.click(ev);
		return false;
	});
	var doc = $(document);
	doc.on("keydown.grabber",function(ev) {
		if(that.keydown) that.keydown(ev);
		return false;
	});
	doc.on("keyup.grabber",function(ev) {
		if(that.keyup) that.keyup(ev);
		return false;
	});
	doc.on("keypress.grabber",function(ev) {
		if(that.keypress) that.keypress(ev);
		return false;
	});
	this.grabber = grabber;
}

Grabber.prototype.release = function() {
	$(document).off(".grabber");
	this.grabber.remove();
};

// Check if this element's box overlaps the passed element's box.
// Due to jquery/css/DOM limitations that are not easily worked around,
// This only works exactly when neither element has a border.
$.fn.overlaps = function(rhs) {
	var p1 = this.offset();
	p1.bottom = p1.top + this.innerHeight();
	p1.right = p1.left + this.innerWidth();

	var p2 = rhs.offset();
	p2.bottom = p2.top + rhs.innerHeight();
	p2.right = p2.left + rhs.innerWidth();
	
	return !(
		p1.top > p2.bottom ||
		p1.bottom < p2.top ||
		p1.left > p2.right ||
		p1.right < p2.left
	);
}

// Stolen from MDN and tightened up a little
Math.roundn = function(value, exp) {
	value = +value;
	exp = +exp;
	// If the value is not a number or the exp is not an integer...
	if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0))
		return NaN;
	// Shift
	value = value.toString().split('e');
	value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
	// Shift back
	value = value.toString().split('e');
	return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
}
