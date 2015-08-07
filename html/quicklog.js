var loglist;
var log_colorno = 0;
var colors = [ "#fcc","#cfc","#ccf","#cff","#fcf","#ffc","#ccc" ];

function log(msg) {
	var c = colors[log_colorno];
	log_colorno  = (log_colorno + 1) % colors.length;
	if(!loglist) {
		loglist = document.createElement('div');
		loglist.style.border = '1px solid';
		loglist.style.padding = '8px';
		loglist.style.bottom = "8px";
		loglist.style.right = "8px";
		loglist.style.position = "absolute";
		loglist.id = 'loglist';
		document.body.appendChild(loglist);
	}

	var item = document.createElement('div');
	item.style.background = c;
	item.innerHTML = msg;
	
	if(loglist.children.length >= 30) loglist.removeChild(loglist.children[0]);
	loglist.appendChild(item);
}
