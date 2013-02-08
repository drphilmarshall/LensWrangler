/*
 * Javascript Lens Wrangler
 * 2013 Phil Marshall & Stuart Lowe
 *
 * Licensed under the MPL http://www.mozilla.org/MPL/MPL-1.1.txt
 * 
 * Requires lens.js, from https://raw.github.com/slowe/lensjs/master/lens.js
 
 * History: 
 *   2013-02-08 Mashed together inexpertly from LensToy and lensjs/index.html
 */

function LensWrangler(input){

	// Set some variables
	this.id = (input && typeof input.id=="string") ? input.id : "LensWrangler";
	this.src = (input && typeof input.src=="string") ? input.src : "";
	this.width = (input && typeof input.width=="number") ? input.width : parseInt(getStyle(this.id, 'width'), 10);
	this.height = (input && typeof input.height=="number") ? input.height : parseInt(getStyle(this.id, 'height'), 10);
	
    // Define some events
	this.events = {load:"",click:"",mousemove:""};
	
	// Create an instance of a gravitational lens, 
	this.lens = new Lens({ 'width': this.width, 'height': this.height, 'pixscale':0.037});
	
	// and add its lens mass and source brightness components (units=arcseconds):
	this.lens.add({plane: "lens", theta_e: 1.0, x: -2.0, y: -1.0});
	this.lens.add({plane: "lens", theta_e: 1.2, x:  2.0, y:  0.0});
	this.lens.add({plane: "source", size:  1.25, x: 100.0, y:  100.0});

	// Calculate the deflection angle vector field, alpha(x,y):
	this.lens.calculateAlpha();

	// Now use this to calculate the lensed image, ready for contouring:
	this.lens.calculateImage();

	// Get the display ready:
    this.img = { complete: false };

	this.setup(this.id);

	if(this.src) this.load(this.src);

	this.ctx.clearRect(0,0,this.width,this.height);
	this.copyToClipboard();

    // Now get the source position from the mouse and start drawing!
	this.bind("mousemove",{lens:this.lens},function(e){

		// Remove existing sources
		this.lens.removeAll('source');

		// Set the lens source to the current cursor position, transforming pixel coords to angular coords:
		var coords = this.lens.pix2ang({x:e.x, y:e.y});
		this.lens.add({ plane: 'source', size:  1.25, x: coords.x, y: coords.y });

		// Paste original image
		this.pasteFromClipboard();

		// Re-calculate the lensed image
		this.lens.calculateImage();

		// Draw the lensed image on top, given source position
		this.drawLensImage({ x: e.x, y:e.y });
		// Draw the lensed image contours on top, given source position
		// this.drawLasso({ x: e.x, y:e.y });

	});

}
LensWrangler.prototype.drawLensImage = function(source){

	var imgData = this.ctx.createImageData(this.width, this.height);
	var pos = 0;
	var c = [195, 215, 255];
	
	// Loop over the predicted image
	for(var i = 0; i < this.width*this.height ; i++){

		// Add to red channel
		imgData.data[pos+0] = c[0];

		// Add to green channel
		imgData.data[pos+1] = c[1];

		// Add to blue channel
		imgData.data[pos+2] = c[2];

		// Alpha channel
		// MAGIC number 0.1, trades off with blur steps...
		imgData.data[pos+3] = Math.round(0.1*255)*this.lens.predictedimage[i];

		pos += 4;
	}

	// Blur the image
	imgData = this.blur(imgData);

	// Because of the way putImageData replaces all the pixel values, 
	// we have to create a temporary canvas and put it there.
	var overlayCanvas = document.createElement("canvas");
	overlayCanvas.width = this.width;
	overlayCanvas.height = this.height;
	overlayCanvas.getContext("2d").putImageData(imgData, 0, 0);

	// Now we can combine the new image with our existing canvas
	// whilst preserving transparency
	this.ctx.drawImage(overlayCanvas, 0, 0);
      
    // This procedure includes some interpolation on to the larger canvas, preventing us seeing the pixels...
}

LensWrangler.prototype.blur = function(imageData){
	//return this.convolve(imageData, this.kernel);

	var steps = 5;
      // Kernel width 0.9", trades off with alpha channel...
	var smallW = Math.round(this.width / this.scale);
	var smallH = Math.round(this.height / this.scale);

	var canvas = document.createElement("canvas");
	canvas.width = this.width;
	canvas.height = this.height;
	var ctx = canvas.getContext("2d");
	ctx.putImageData(imageData,0,0);

	var copy = document.createElement("canvas");
	copy.width = smallW;
	copy.height = smallH;
	var copyCtx = copy.getContext("2d");

	// Convolution with square top hat kernel, by shifting and redrawing image...
      // Does not get brightness quite right...
      for (var i=0;i<steps;i++) {
		var scaledW = Math.max(1,Math.round(smallW - i));
		var scaledH = Math.max(1,Math.round(smallH - i));

		copyCtx.clearRect(0,0,smallW,smallH);
		copyCtx.drawImage(canvas,0,0,this.width,this.height,0,0,scaledW,scaledH);
		ctx.drawImage(copy,0,0,scaledW,scaledH,0,0,this.width,this.height);
	}

	return ctx.getImageData(0,0,this.width,this.height);

}

LensWrangler.prototype.drawLasso = function(source){
// Get contours of the predicted arcs, and plot them on top of the image.
// BUG: nice if we could just use the imageData from the function above... :-/ 

    // First, pull in the predicted image and blur it:
	var pimage = this.ctx.createImageData(this.width, this.height);
	for(var i = 0; i < this.width*this.height ; i++){
        pimage.data[i] = this.lens.predictedimage[i];
	}
    pimage = this.blur(pimage);

    // Reshape to a 2d array and contour:    
	if(typeof Conrec==="function"){
		var i, row, col;
		var pimage2d = new Array(this.lens.h);
		for(row = 0 ; row < this.lens.h ; row++){
			pimage2d[row] = new Array(this.lens.w);
			for(col = 0 ; col < this.lens.w ; col++){
				i = row + col*this.lens.h;
				pimage2d[row][col] = pimage.data[i];
			}
		}
		var lasso = contour(pimage2d,[0.1]);
		outline = lasso.contourList();
		drawContours(outline, this);
    }
      
}

// We need to set up the canvas. This may mean attaching to an existing <div>
// By the end of this function we have this.ctx available with events attached.
// Make sure you have set the width/height of the canvas element
LensWrangler.prototype.setup = function(id){
	if(this.ctx) return this;

	// Now we want to build the <canvas> element that will hold our image
	var el = document.getElementById(id);
	//if(console && typeof console.log=="function") console.log('setup',el,id)
	if(el!=null){
		// Look for a <canvas> with the specified ID or fall back on a <div>
		if(typeof el=="object" && el.tagName != "CANVAS"){
			// Looks like the element is a container for our <canvas>
			el.setAttribute('id',this.id+'holder');
			var canvas = document.createElement('canvas');
			canvas.style.display='block';
			canvas.setAttribute('width',this.width);
			canvas.setAttribute('height',this.height);
			canvas.setAttribute('id',this.id);
			el.appendChild(canvas);
			// For excanvas we need to initialise the newly created <canvas>
			if(/*@cc_on!@*/false) el = G_vmlCanvasManager.initElement(this.canvas);
		}else{
			// Define the size of the canvas
			// Excanvas doesn't seem to attach itself to the existing
			// <canvas> so we make a new one and replace it.
			if(/*@cc_on!@*/false){
				var canvas = document.createElement('canvas');
				canvas.style.display='block';
				canvas.setAttribute('width',this.width);
				canvas.setAttribute('height',this.height);
				canvas.setAttribute('id',this.id);
				el.parentNode.replaceChild(canvas,el);
				if(/*@cc_on!@*/false) el = G_vmlCanvasManager.initElement(elcanvas);
			}else{
				el.setAttribute('width',this.width);
				el.setAttribute('height',this.height);
			}   
		}
		this.canvas = document.getElementById(id);
	}else this.canvas = el;
	this.ctx = (this.canvas) ? this.canvas.getContext("2d") : null;

	// The object didn't exist before so we add event listeners to it
	var _obj = this;
	addEvent(this.canvas,"click",function(e){
		_obj.getCursor(e);
		_obj.trigger("click",{x:_obj.cursor.x,y:_obj.cursor.y});
	});
	addEvent(this.canvas,"mousemove",function(e){
		_obj.getCursor(e);
		_obj.trigger("mousemove",{x:_obj.cursor.x,y:_obj.cursor.y})
	});

	return this;
}

// Loads the image file. You can provide a callback or have
// already assigned one with .bind('load',function(){ })
LensWrangler.prototype.load = function(source,fnCallback){
	if(typeof source=="string") this.src = source;
	if(typeof this.src=="string"){

		this.image = null

		var _obj = this;

		this.img = new Image();
		this.img.onload = function(){
			_obj.setScale(this.width);
			_obj.draw();
			_obj.lens.calculateImage();
			// Call any callback functions
			if(typeof fnCallback=="function") fnCallback(_obj);
			_obj.trigger("load");
		}
		this.img.src = this.src;
	}
	return this;
}

LensWrangler.prototype.setScale = function(w){
	this.scale = this.width/w;
}

LensWrangler.prototype.copyToClipboard = function(){
	if(this.ctx){
		// Will fail if the browser thinks the image was cross-domain
		try {
			this.clipboard = this.ctx.getImageData(0, 0, this.width, this.height);
			this.clipboardData = this.clipboard.data;
		}catch(e){};
	}
	return this;
}

LensWrangler.prototype.pasteFromClipboard = function(){
	if(this.ctx){
		// Will fail if the browser thinks the image was cross-domain
		try {
			this.clipboard.data = this.clipboardData;
			this.ctx.putImageData(this.clipboard, 0, 0);
		}catch(e){};
	}
	return this;
}

// Use <canvas> to draw a 2D image
LensWrangler.prototype.draw = function(type){
	//if(console && typeof console.log=="function") console.log('draw',this.canvas)
	if(!this.ctx) return this;

	this.ctx.clearRect(0,0,this.width,this.height);
//	this.ctx.drawImage(this.img,0,0,this.width,this.height);

	return this;
}

LensWrangler.prototype.getCursor = function(e){
	var x;
	var y;
	if (e.pageX != undefined && e.pageY != undefined){
		x = e.pageX;
		y = e.pageY;
	}else{
		x = e.clientX + document.body.scrollLeft + document.body.scrollLeft +document.documentElement.scrollLeft;
		y = e.clientY + document.body.scrollTop + document.body.scrollTop +document.documentElement.scrollTop;
	}

	var target = e.target
	while(target){
		x -= target.offsetLeft;
		y -= target.offsetTop;
		target = target.offsetParent;
	}
	this.cursor = {x:x, y:y};
	return this.cursor;
}

// Attach a handler to an event for the Canvas object in a style similar to that used by jQuery
// .bind(eventType[,eventData],handler(eventObject));
// .bind("resize",function(e){ console.log(e); });
// .bind("resize",{me:this},function(e){ console.log(e.data.me); });
LensWrangler.prototype.bind = function(ev,e,fn){
	if(typeof ev!="string") return this;
	if(typeof fn==="undefined"){
		fn = e;
		e = {};
	}else{
		e = {data:e}
	}
	if(typeof e!="object" || typeof fn!="function") return this;
	if(this.events[ev]) this.events[ev].push({e:e,fn:fn});
	else this.events[ev] = [{e:e,fn:fn}];
	return this;
}

// Trigger a defined event with arguments. This is for internal-use to be
// sure to include the correct arguments for a particular event
LensWrangler.prototype.trigger = function(ev,args){
	if(typeof ev != "string") return;
	if(typeof args != "object") args = {};
	var o = [];
	if(typeof this.events[ev]=="object"){
		for(var i = 0 ; i < this.events[ev].length ; i++){
			var e = G.extend(this.events[ev][i].e,args);
			if(typeof this.events[ev][i].fn == "function") o.push(this.events[ev][i].fn.call(this,e))
		}
	}
	if(o.length > 0) return o;
}


// Helpful functions

// Cross-browser way to add an event
if(typeof addEvent!="function"){
	function addEvent(oElement, strEvent, fncHandler){
		if(oElement.addEventListener) oElement.addEventListener(strEvent, fncHandler, false);
		else if(oElement.attachEvent) oElement.attachEvent("on" + strEvent, fncHandler);
	}
}

function trim(s) {
	s = s.replace(/(^\s*)|(\s*$)/gi,"");
	s = s.replace(/[ ]{2,}/gi," ");
	s = s.replace(/\n /,"\n");
	return s;
}

// A non-jQuery dependent function to get a style
function getStyle(el, styleProp) {
	if (typeof window === 'undefined') return;
	var style;
	var el = document.getElementById(el);
	if (el.currentStyle) style = el.currentStyle[styleProp];
	else if (window.getComputedStyle) style = document.defaultView.getComputedStyle(el, null).getPropertyValue(styleProp);
	if (style && style.length === 0) style = null;
	return style;
}

// Extra mathematical/helper functions that will be useful - inspired by http://alexyoung.github.com/ico/
var G = {};
G.sum = function(a) { var i, sum; for (i = 0, sum = 0; i < a.length; sum += a[i++]) {}; return sum; };
if (typeof Array.prototype.max === 'undefined') G.max = function(a) { return Math.max.apply({}, a); };
else G.max = function(a) { return a.max(); };
if (typeof Array.prototype.min === 'undefined') G.min = function(a) { return Math.min.apply({}, a); };
else G.min = function(a) { return a.min(); };
G.mean = function(a) { return G.sum(a) / a.length; };
G.stddev = function(a) { return Math.sqrt(G.variance(a)); };
G.log10 = function(v) { return Math.log(v)/2.302585092994046; };
G.variance = function(a) { var mean = G.mean(a), variance = 0; for (var i = 0; i < a.length; i++) variance += Math.pow(a[i] - mean, 2); return variance / (a.length - 1); };
if (typeof Object.extend === 'undefined') {
	G.extend = function(destination, source) {
		for (var property in source) {
			if (source.hasOwnProperty(property)) destination[property] = source[property];
		}
		return destination;
	};
} else G.extend = Object.extend;


