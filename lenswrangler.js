/*
 * Javascript Lens Wrangler
 *
 * 2013 Phil Marshall & Stuart Lowe
 *
 * Licensed under the MPL http://www.mozilla.org/MPL/MPL-1.1.txt
 * 
 * Requires lens.js, from https://raw.github.com/slowe/lensjs/master/lens.js
 *
 * History: 
 *   2013-02-08 Mashed together inexpertly from LensWrangler and lensjs/index.html
 */
 
// Enclose the Javascript
(function(exports) {
	exports.LensWrangler = LensWrangler;

	// First we will create the basic function
  function LensWrangler(obj) {
	  
    this.model = (obj && typeof obj.model === "string") ? obj.model : "lenswrangler-model";
    this.prediction = (obj && typeof obj.prediction === "string") ? obj.prediction : "lenswrangler-prediction";
    
    // Set some variables based on the inputs:
    this.id = (obj && typeof obj.id == "string") ? obj.id : "lenswrangler-model";
		this.pixscale = (obj && typeof obj.pixscale == "number") ? obj.pixscale : 1.0;
    
		// Set up the canvas for drawing the model image etc:
		this.paper = new Canvas({ 'id': this.id });
    
    this.modelPaper = new Canvas({'id': this.model});
    this.predictionPaper = new Canvas({'id': this.prediction});
    
    // Get the canvas width and height:
		this.width = this.paper.width;
		this.height = this.paper.height;
    
    // Let's define some events
    this.events = {load:"",loadimage:"",click:"",mousemove:"",mouseout:"",mouseover:"",init:""};
    this.img = { complete: false };
    this.showcrit = true;
	  
		// Create an instance of a lens:
		this.lens = new Lens({ 'width': this.width, 'height': this.height, 'pixscale': this.pixscale});

		// Setup our buttons etc
		this.setup();
	
    // The possible lens models!
    // NB. It would be good to be able to define the PSFwidth here, and pass it down to the 
    // canvas routines so that the PSF blurring is well-emulated.
 
		this.models = new Array();
		this.models.push({
			name: 'Example',
      src:" http://lenszoo.files.wordpress.com/2013/12/asw0009cjs-zoomed.jpg",
      // src: "CSWA5_15x15arcsec.jpg",
      PSFwidth: 1.2,
			components: [
        {plane: "lens", theta_e: 1.8, x: -2.4, y: -0.7},
        {plane: "lens", theta_e: 1.9, x:  2.7, y:  0.2},
        {plane: "lens", theta_e: 0.4, x: -4.6, y:  1.7},
        {plane: "source", size:  0.7, x: 100.0, y:  100.0}
        ],
            events: {
				mousemove: function(e){
					var t = this.lens.pix2ang({x:e.x, y:e.y});
          var msg = "Cursor position = "+(t.x.toFixed(1))+","+(t.y.toFixed(1));
					this.setStatus(msg);
				}
            }
		});
	
	
		this.init();
	
	}
	
	// Contour using conrec.js
	LensWrangler.prototype.getContours = function(data,z){
		// data should be a 2D array
	
		var c = new Conrec();
	
		// Check inputs
		if(typeof data!=="object") return c;
		if(typeof z!=="object") return c;
		if(data.length < 1) return c;
		if(data[0].length < 1) return c;
	
		var ilb = 0;
		var iub = data.length-1;
		var jlb = 0;
		var jub = data[0].length-1;
		var idx = new Array(data.length);
		var jdx = new Array(data[0].length);
		for(var i = 0 ; i < idx.length ; i++) idx[i] = i+1;
		for(var j = 0 ; j < jdx.length ; j++) jdx[j] = j+1;
	
		// contour(d, ilb, iub, jlb, jub, x, y, nc, z)
		// d               ! matrix of data to contour
		// ilb,iub,jlb,jub ! index bounds of data matrix
		// x               ! data matrix column coordinates
		// y               ! data matrix row coordinates
		// nc              ! number of contour levels
		// z               ! contour levels in increasing order
		c.contour(data, ilb, iub, jlb, jub, idx, jdx, z.length, z);
		return c;
	}
	
	LensWrangler.prototype.drawContours = function(canvas, c, opt){
		if(c.length < 1) return;
    
		var color = (opt && typeof opt.color==="string") ? opt.color : '#FFFFFF';
		var lw = (opt && typeof opt.lw==="number") ? opt.lw : 1;
		var i, j, l;
		canvas.ctx.strokeStyle = color;
		canvas.ctx.lineWidth = lw;
		// Loop over separate contour loops, of which there are c.length:
        for(l = 0; l < c.length ; l++){
			canvas.ctx.beginPath();

			// Move to the start of this contour:
			// this.paper.ctx.moveTo(c[l][0].x,c[l][0].y);
			// Join the dots in this contour:
			// for(i = 1; i < c[l].length ; i++) {
            //     this.paper.ctx.lineTo(c[l][i].x,c[l][i].y);
			// }

            // Plot contours as points (actually circles):
			for(i = 0; i < c[l].length ; i++) {
        canvas.ctx.arc(c[l][i].x,c[l][i].y,0.5,0.0,Math.PI*2.0,true);
			}
      
      canvas.ctx.closePath();
			canvas.ctx.stroke();
		}
		
		return this;
	}
	
	// We are going to keep the lens.js library independent of 
	// the DOM/<canvas> so we need a function that goes through
	// building an RGBA image and drawing it to the canvas.
	LensWrangler.prototype.drawAll = function(lens,canvas){
	
		this.drawComponent("lens");
		this.drawComponent("mag");
		this.drawComponent("image");
	
		return this;
	}
	
	// Draw a specific component of the Lens object
	LensWrangler.prototype.drawComponent = function(mode){
	
		lens = this.lens;
		canvas = this.paper;
	
		// Inputs are:
		//   mode - e.g. 'lens', 'mag' or 'image'
	
		if(!mode || typeof mode!=="string") return;
	
		// -------------------------
		// Create the lens mass distribution
		
		// Have we previously made this component layer?
		var previous = (canvas.clipboard[mode]) ? true : false;
	
		// Load in the previous version if we have it (this will save us setting the RGB)
		var imgData = (previous) ? canvas.clipboard[mode] : canvas.ctx.createImageData(lens.w, lens.h);
		var pos = 0;
		var c = [0, 0, 0];
	
		// The RGB colours
		if(mode == "lens") c = [60, 60, 60];
		else if(mode == "mag") c = [0, 120, 0];
		// else if(mode == "image") c = [195, 215, 255];
		// Better color for CFHTLS examples:
        else if(mode == "image") c = [115, 185, 255];
	
		// We just want to draw sources		
		if(mode == "source"){
			canvas.ctx.fillStyle = "#FF9999";
			canvas.ctx.strokeStyle = "#FFFFFF";
			for(var i = 0 ; i < lens.source.length ; i++){
				// Add a circle+label to show where the source is
				var r = 5;
				canvas.ctx.beginPath();
				canvas.ctx.arc(lens.source[i].x-parseInt(r/2), lens.source[i].y-parseInt(r/2), r, 0 , 2 * Math.PI, false);
				canvas.ctx.strokeText("Source "+(i+1),lens.source[i].x+r, lens.source[i].y+r);
				canvas.ctx.fill();
				canvas.ctx.closePath();
			}
			return;
		}
	
		// Loop over the components
		for(var i = 0; i < lens.w*lens.h ; i++){
	
			// If we've not drawn this layer before we should set the RGB
			if(!previous){
				// Add to red channel
				imgData.data[pos+0] = c[0];
	
				// Add to green channel
				imgData.data[pos+1] = c[1];
	
				// Add to blue channel
				imgData.data[pos+2] = c[2];
			}
	
			// Alpha channel
			if(mode == "lens"){
				// MAGIC number 0.7 -> Math.round(255*0.7) = 179
				imgData.data[pos+3] = 179*Math.sqrt(lens.mag[i].kappa);
			}else if(mode == "mag"){
				// MAGIC number 0.01 -> Math.round(255*0.01) = 3
				imgData.data[pos+3] = 3/Math.abs(lens.mag[i].inverse);
			}else if(mode == "image"){
				// MAGIC number 0.1, trades off with blur steps... -> Math.round(255*0.2) ~ 50
				imgData.data[pos+3] = 50*lens.predictedimage[i];
				// Without blurring:
                // imgData.data[pos+3] = 165*lens.predictedimage[i];
			}else{
				imgData.data[pos+3] = 255;
			}
			pos += 4;
		}
	
		// Keep a copy of the image in a clipboard named <mode>
		canvas.copyToClipboard(mode,imgData);
	
		if(mode == "image"){
			// Blur the image? Try without!
			imgData = canvas.blur(imgData, lens.w, lens.h);
		}
	
		// Draw the image to the <canvas> in the DOM
		canvas.overlay(imgData);
		
		return this;
	}
	
	LensWrangler.prototype.setStatus = function(msg){
		if(document.getElementById('status')) document.getElementById('status').innerHTML = msg;
	}
	
	
	// We need to set up.
	LensWrangler.prototype.setup = function(){
	
		this.buttons = { crit: document.getElementById('criticalcurve') };
		var _obj = this;
		if(this.buttons.crit){
			addEvent(this.buttons.crit,"click",function(e){
				_obj.showcrit = !_obj.showcrit;
				_obj.update();
			});
		}
		addEvent(this.paper.canvas, "mousemove", function(e){
      // var c = _obj.paper.getCursor(e);
      
      // paper.getCursor is not calculating the canvas pixel correctly
      // using offsetX/Y instead.
			_obj.trigger("mousemove",{x: e.layerX, y: e.layerY})
		});
		addEvent(this.paper.canvas,"mouseout",function(e){
			_obj.trigger("mouseout")
		});
		addEvent(this.paper.canvas,"mouseover",function(e){
			_obj.trigger("mouseover")
		});
	
		return this;
	}
	
  LensWrangler.prototype.initModelUI = function() {
    console.log(this.paper);
  }
  
	// Return a model by name
	LensWrangler.prototype.getModel = function(name){
		if(typeof name === "string"){
			for(var i = 0; i < this.models.length; i++){
				if(this.models[i].name==name) return this.models[i];
			}
		}
		// No match so return the first model
		return this.models[0];
	}
	
	LensWrangler.prototype.init = function(inp,fnCallback){
	
		this.model = this.getModel(inp);
		
		if(typeof this.model.src === "string") this.loadImage(this.model.src);
	
		if(typeof this.model.components === "object"){
			this.lens.removeAll('lens');
			this.lens.removeAll('source');
			for(var i = 0; i < this.model.components.length ; i++){
				// Add all the lens mass and source brightness components (units=arcseconds):
				this.lens.add(this.model.components[i]);
			}
	
			// Calculate the deflection angle vector field, alpha(x,y):
			this.lens.calculateAlpha();
	
			// Now use this to calculate the lensed image:
			this.lens.calculateImage();

      this.initModelUI();
	
			// If we have the Conrec object available we can plot the critical 
			// curve, and an outline of the lensed image:
			
			this.critcurve = [];
			this.caustics = [];
			var lcontours = [];
			if(typeof Conrec==="function"){
				
				// Need to get our 1D array into the right form;
				// Return our internal 1D representation as a 2D array.
				var i, row, col;
				
				// Critical curve:
				var invmag = new Array(this.lens.h);
				for(row = 0 ; row < this.lens.h ; row++){
					invmag[row] = new Array(this.lens.w);
					for(col = 0 ; col < this.lens.w ; col++){
						i = row + col*this.lens.h;
						invmag[row][col] = this.lens.mag[i].inverse;
					}
				}
				var contours = this.getContours(invmag,[0.0]);
				this.critcurve = contours.contourList();
                
                // Caustics:
                this.caustics = new Array(this.critcurve.length);
		        // Loop over separate loops of the critcurve contour, of which there are c.length:
                var c = this.critcurve;
                for(l = 0; l < c.length ; l++){
                    this.caustics[l] = new Array(this.critcurve[l].length);
			        // Loop over all the points in this contour, mapping them back to the source plane:
			        for(k = 0; k < c[l].length ; k++) {
                        i = this.lens.altxy2i(Math.round(c[l][k].x),Math.round(c[l][k].y));                 
                        this.caustics[l][k] = {x: (Math.round(c[l][k].x - this.lens.alpha[i].x)),
                                               y: (Math.round(c[l][k].y - this.lens.alpha[i].y))};
                                               
                        // if (l == 0) console.log(c[l][k],i, this.lens.alpha[i],this.caustics[l][k]);
                    }    
		        }
                
			}
		}
	
	
		this.paper.clear();
    this.modelPaper.clear();
    this.predictionPaper.clear();
    
		// Take a copy of the blank <canvas>
		this.paper.copyToClipboard();
	
		// Reset mousemove events
		this.events['mousemove'] = "";
	
		// Bind the callback events
		var e = ["mousemove","mouseover","mouseout"];
		var ev = "";
		for(var i = 0; i < e.length; i++){

			if(this.model.events[e[i]] && typeof this.model.events[e[i]]==="function") ev = this.model.events[e[i]];
			else ev = "";

			if (typeof ev === "function") {
				// Zap any existing events
				this.events[e[i]] = "";
				this.paper.events[e[i]] = "";
				if (e[i] == "mousemove") {
          this.paper.bind(e[i], { ev:ev, wrangler:this }, function(e) {
            e.data.wrangler.update(e);
          });
        }
				this.bind(e[i],ev);
			}
		}
	
		if(typeof fnCallback=="function") fnCallback(this);
		this.trigger("init");
	
        // console.log(this);
    
		return this;
	}
	
	LensWrangler.prototype.update = function(e){
    
		// Get the size of the existing source
		var src = this.lens.source[0];

		// Remove existing sources
		this.lens.removeAll('source');
	
		if(!e) e = { x : 1000, y: 1000 }
		// Set the lens source to the current cursor position, transforming pixel coords to angular coords:
		var coords = this.lens.pix2ang({x:e.x, y:e.y});

		// Update the source x,y positions
		src.x = coords.x;
		src.y = coords.y;
		
		// Add the source back
    this.lens.add(src);
    
		// Paste original image
		this.paper.pasteFromClipboard();

		if (this.showcrit) {
      this.modelPaper.clear();
      this.drawContours(this.modelPaper, this.critcurve, {color:'#007700', lw:2});
      this.drawContours(this.modelPaper, this.caustics, {color:'#007700', lw:2});
    }
        
		// Re-calculate the lensed image
		this.lens.calculateImage();
	
		// Draw the lens image to the canvas
		// this.drawComponent("image");
 
    // Calculate and overlay arcs outline:
		if(typeof Conrec === "function"){
			var i, row, col;
			var pimage = new Array(this.lens.h);
			for(row = 0 ; row < this.lens.h ; row++){
				pimage[row] = new Array(this.lens.w);
				for(col = 0 ; col < this.lens.w ; col++){
					i = row + col*this.lens.h;
					pimage[row][col] = this.lens.predictedimage[i];
				}
			}
      
			var lasso = this.getContours(pimage, [0.4]);
			outline = lasso.contourList();
      outline = this.downsample(outline);
      
      this.predictionPaper.clear();
			this.drawContours(this.predictionPaper, outline, {color:'#00FF00', lw:4});
    }

    // drawComponent("source", this.lens, c);


	}
	
  // Downsample contours from a list of contours
  LensWrangler.prototype.downsample = function(contourList) {
    var factor = 4;
    var downsampledList = [];
    
    for (var i = 0; i < contourList.length; i += 1) {
      var contour = contourList[i];
      var downsampled = [];
      
      for (var j = 0; j < contour.length; j += factor) {
        downsampled.push(contour[j]);
      }
      
      downsampledList.push(downsampled);
    }
    
    return downsampledList;
  }
  
	// Loads the image file. You can provide a callback or have
	// already assigned one with .bind('load',function(){ })
	LensWrangler.prototype.loadImage = function(source, fnCallback){
	
		var src = "";
	
		if(typeof source==="string") src = source;
	
		if(typeof src=="string" && src){
	
			this.image = null
	
			var _obj = this;
	
			this.img = new Image();
			this.img.onload = function(){
				_obj.update();
				// Call any callback functions
				if(typeof fnCallback=="function") fnCallback(_obj);
				_obj.trigger("loadimage");
			}
			this.img.src = src;
		}
	
		return this;
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
			if(!oElement) { console.log(oElement); return; }
			if(oElement.addEventListener) oElement.addEventListener(strEvent, fncHandler, false);
			else if(oElement.attachEvent) oElement.attachEvent("on" + strEvent, fncHandler);
		}
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

})(typeof exports !== "undefined" ? exports : window);
