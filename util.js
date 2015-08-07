Function.prototype.base = function(B) {
	var x = function() {}; x.prototype = B.prototype;
	this.prototype = new x();
	this.prototype.constructor = this;
}

var tmpfile_id = 1;

// Look how much I care about namespaces!
tmpFileName = function(prefix) {
	if(prefix === undefined) prefix = "unspecified";
	return "/tmp/"+prefix+"-"+process.pid+"-"+(tmpfile_id++);
}

