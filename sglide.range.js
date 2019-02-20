/*global window:false, console:false, document:false, event:false, jQuery:false */

/***********************************************************************************

author:		Daniel B. Kazmer (webshifted.com)
created:	11.11.2014
version:	1.3.0

	version history:
		2.0.0	retina setting default set to false ...
		1.3.0	added snap sensitivity - accepts decimal values between 0 & 3 inclusive; added bar-drag; bug fix: set to correct values at onSnap asynchronously; cleaner: relying on offset values instead of style (type String); slight performance improvement with constraint checker mitigation; improved hard snap, esp. when startAt values are not at markers; better destroy method (06.04.2017)
		1.0.1	bug fix: text inputs were not selectable by mouse-drag in Chrome for jQuery - a proper if statement in the document's mousemove event listener solved it, thereby possibly increasing performance (applied to both jQuery and standalone) (01.02.2015)
		1.0.0	created - born of sGlide

	usage:
		pass an empty DIV, with a unique id to the following class

		var my_sGlide_instance = new sGlide(my_element, {
			startAt: 60,			// start slider knob at - default: 0
			image: ''				// string - image path
			retina: true,			// boolean - larger knob image with suffix @2x for retina displays
			width: 200,				// integer - default: 100
			height: 20,				// integer - default: 40
			unit: 'px',				// 'px' or '%' (default)
			pill:					// boolean - default: true
			snap: {
				marks		: false,
				type		: 'hard' | 'soft',
				points		: 0,
				sensitivity	: 0
			},
			disabled:				// boolean - default: false
			vertical:				// boolean - default: false
			drop/drag/onSnap/onload: function(o){
				console.log('returned object',o);
			}
		});

		All properties are optional. To retrieve data, use one of the callbacks

	goals:
		- test: positions of locked handles when startAt point specified
		- if unit is %, then markers should be also
		- fix bug: rebuilding vertical rotates again (is this fixed already?)

***********************************************************************************/

function sGlideRange(self, options){

	//------------------------------------------------------------------------------------------------------------------------------------
	// global variables

	var that		= this;
	var knobs		= null,
		knob1		= null,
		knob2		= null,
		follows		= null,
		follow1		= null,
		follow2		= null,
		startAt		= null,
		img			= '',
		isMobile	= false,
		// events
		eventDocumentMouseUp	= null,
		eventDocumentMouseMove	= null,
		eventDocumentMouseDown	= null,
		eventKnobMouseUp		= null,
		eventKnobMouseDown		= null,
		eventBarMouseUp			= null,
		eventBarMouseDown		= null,
		eventWindowResize		= null,
		// event states prelim
		mEvt	= {
			'down'	: 'mousedown',
			'up'	: 'mouseup',
			'move'	: 'mousemove'
		};

	this.element = self;

	//------------------------------------------------------------------------------------------------------------------------------------
	// public methods

	this.destroy = function(){
		var guid = self.getAttribute('id');

		// unwrap vertical buttons
		var vertContainer = $('#'+guid+'_vert-marks');
		if (vertContainer){
			var vertParent = vertContainer.parentNode;
			vertParent.insertBefore(self, vertContainer.nextSibling);
			vertParent.removeChild(vertContainer);
		}

		var markers = $('#'+guid+'_markers');
		if (markers) markers.parentNode.removeChild(markers);

		if (isMobile)
			document.removeEventListener(mEvt.down, eventDocumentMouseDown);

		document.removeEventListener(mEvt.move, eventDocumentMouseMove);
		document.removeEventListener(mEvt.up, eventDocumentMouseUp);
		window.removeEventListener('resize', eventWindowResize);
		knob1.removeEventListener(mEvt.up, eventKnobMouseUp);
		knob1.removeEventListener(mEvt.down, eventKnobMouseDown);
		knob2.removeEventListener(mEvt.up, eventKnobMouseUp);
		knob2.removeEventListener(mEvt.down, eventKnobMouseDown);
		follow2.removeEventListener(mEvt.up, eventBarMouseUp);
		follow2.removeEventListener(mEvt.down, eventBarMouseDown);
		while (self.hasChildNodes()){
			self.removeChild(self.lastChild);
		}
		self.removeAttribute('style');
		self.removeAttribute('data-state');
		self.classList.remove('vertical');

		for (var i in this) delete this[i];
	};

	this.startAt = function(pct, pctTo){
		if (typeof pct != 'number' && !pct instanceof Array) throw new Error('startAt method requires at least one Number argument (percentage value)');

		// validation
		if (typeof pctTo == 'number')	pct = [pct, pctTo];
		if (pct instanceof Array){
			if (pct[0] > pct[1]) pct = [50, 50];
		}
		else if (pct > pctTo)	pct = [50, 50];
		else pct = [pct, pct];

		startAt = pct;

		var selfWidth	= self.offsetWidth,
			knobWidth	= knob1.offsetWidth * 2,
			px			= [],
			pxAdjust	= [];

		// constraints
		for (var i = 0; i < pct.length; i++){
			if (i === 2) break;

			if (pct[i] <= 0)		pct[i] = 0;
			else if (pct[i] >= 100)	pct[i] = 100;

			// set pixel positions
			px.push((selfWidth - knobWidth) * pct[i] / 100 + (knobWidth / 2));
			pxAdjust.push(px[i] - knobWidth / 2);
		}

		// gui
		knob1.style.left = pxAdjust[0]+'px';
		knob2.style.left = pxAdjust[1]+'px';
		follow1.style.width = (px[0]-knobWidth/4)+'px';
		follow2.style.width = (px[1]+knobWidth/4)+'px';

		knob1.data('px', pxAdjust[0]);
		knob2.data('px', pxAdjust[1]);

		return this;
	};

	var callback = null;
	var notifier = function(fn){ callback = fn; };
	// self.addEventListener('sGlide.ready', function(data){ if (callback) callback.call(that, data.detail); });
	this.load = notifier;

	//------------------------------------------------------------------------------------------------------------------------------------
	// private global functions

	var $ = function(name, c){
		if (!c)
			return document.querySelectorAll(name);
		return c.querySelectorAll(name);
	};

	function wrapAll(elements, wrapperStr){
		// set wrapper element
		var a = document.createElement('div');
		a.innerHTML = wrapperStr;
		var wrapperEl = a.childNodes[0];
		elements[0].parentNode.insertBefore(wrapperEl, elements[0]);

		// append it
		for (var i = 0; i < elements.length; i++) wrapperEl.appendChild(elements[i]);
	}

	function clone(obj){
		if (obj === null || typeof(obj) != 'object') return obj;

		var temp = obj.constructor(); // changed

		for (var key in obj){
			if (obj.hasOwnProperty(key)){
				temp[key] = clone(obj[key]);
			}
		}

		return temp;
	}

	// from https://gist.github.com/pbojinov/8f3765b672efec122f66
	function extend(destination, source){
		for (var property in source){
			if (source[property] && source[property].constructor && source[property].constructor === Object){
				destination[property] = destination[property] || {};
				arguments.callee(destination[property], source[property]);
			} else {
				destination[property] = source[property];
			}
		}
		return destination;
	}

	function css(el, styles, prefixes){
		var cssString = '';

		if (prefixes){
			var temp = {};
			for (var key in styles){
				if (styles.hasOwnProperty(key)){
					for (var i = 0; i < prefixes.length; i++){
						temp[prefixes[i]+key] = styles[key];
					}
				}
			}
			styles = temp;
		}

		for (var key in styles){
			var s = styles[key];
			if (styles.hasOwnProperty(key)){
				// cssString += key + ':' + styles[key] + ';';
				cssString += key + ':' + (typeof s === 'number' ? s + 'px' : s) + ';';
			}
		}

		el.style.cssText += ';' + cssString;
		return el;
	}

	(function(document, that){

		//------------------------------------------------------------------------------------------------------------------------------------
		// validate params

		if (self instanceof Element === false) throw new Error('sGlide: first param expected object<Element>, found '+(typeof self));
		if (options instanceof Object === false) throw new Error('sGlide: second param expected object, found '+(typeof options));

		//------------------------------------------------------------------------------------------------------------------------------------
		// build skeleton

		var guid = self.id;

		// no id? give one!
		if (!guid) guid = self.id = 'sglide-'+Math.random(1, 999);

		// add assets
		self.innerHTML = '<div class="follow_bar follow1"></div><div class="follow_bar follow2"></div><div class="slider_knob s_knob1"></div><div class="slider_knob s_knob2"></div>';

		knobs	= self.getElementsByClassName('slider_knob');
		knob1	= self.getElementsByClassName('s_knob1')[0];
		knob2	= self.getElementsByClassName('s_knob2')[0];
		follows	= self.getElementsByClassName('follow_bar');
		follow1	= self.getElementsByClassName('follow1')[0];
		follow2	= self.getElementsByClassName('follow2')[0];

		//------------------------------------------------------------------------------------------------------------------------------------
		// settings & variables

		var settings = extend({
			'startAt'		: [0,0],
			'image'			: 'none',	// full path of image
			'height'		: 40,
			'width'			: 100,
			'unit'			: null,	// 'px' or '%'
			'pill'			: true,
			'snap'			: {
				'marks'		: false,
				'type'		: false,
				'points'	: 0,
				'sensitivity': 2
			},
			'totalRange'	: [0,0],
			'disabled'		: false,
			'vertical'		: false,
			'retina'		: false,
			'locked'		: false,
			'noHandle'		: false
		}, options);

		self.removeAttribute('style');	// remove user inline styles

		var uAgent = navigator.userAgent;

		if (uAgent.match(/Android/i) ||
			uAgent.match(/webOS/i) ||
			uAgent.match(/iPhone/i) ||
			uAgent.match(/iPad/i) ||
			uAgent.match(/iPod/i) ||
			// uAgent.match(/Windows Phone/i) ||
			uAgent.match(/BlackBerry/i)){
			isMobile = true;
			mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
			var touchX = null, touchY = null;
		} else if (uAgent.match(/Windows Phone/i)){
			if (window.navigator.msPointerEnabled){
				css(self, {'-ms-touch-action': 'none'});
				mEvt.down = 'MSPointerDown'; mEvt.up = 'MSPointerUp'; mEvt.move = 'MSPointerMove';
			} else {
				mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
			}
		}

		// start points cannot be identical as that will break barDrag snapping for first knob (weird)
		if (settings.startAt[0] === settings.startAt[1]){
			if (settings.startAt[1] === 100)
				settings.startAt[0] -= 0.00001;
			else
				settings.startAt[1] += 0.00001;
		}

		// local variables
		var THE_VALUES		= startAt = settings.startAt,
			result_from		= 0,
			result_to		= 0,
			vert			= settings.vertical,
			is_snap			= (settings.snap.points > 0 && settings.snap.points <= 11),
			markers			= (is_snap && settings.snap.marks),
			snapType		= (settings.snap.type != 'hard' && settings.snap.type != 'soft') ? false : settings.snap.type,
			knob_bg			= '#333',
			knob_width_css	= (settings.noHandle ? '0' : '2%'),
			knob_height_css	= 'inherit',
			self_height		= Math.round(settings.height)+'px',
			r_corners		= settings.pill,
			imageBln		= (settings.image != 'none' && settings.image !== '' && !settings.noHandle),
			retina			= (window.devicePixelRatio > 1) && settings.retina,
			customRange		= (settings.totalRange[0] !== 0 || settings.totalRange[1] !== 0) && settings.totalRange[0] < settings.totalRange[1],
			MSoffsetTop		= null,
			vmarks			= null,
			isLocked		= settings.locked;

		// store data to element
		var elData = function(prop, val){
			if (!this.dataObj) this.dataObj = {};
			if (val === undefined)	// leave as is, as val may be 0
				return this.dataObj[prop];
			this.dataObj[prop] = val;
		};

		self.data = elData;
		knob1.data = elData;
		knob2.data = elData;

		//------------------------------------------------------------------------------------------------------------------------------------
		// image handling

		if (imageBln){	// if image
			img = settings.image;

			// string or array
			var multiImageBln = img instanceof Array;

			var processRetinaImage = function(file){
				var rImgTemp = file.split('.');
				var rImgTemp_length = rImgTemp.length;

				rImgTemp[rImgTemp_length-2] = rImgTemp[rImgTemp_length-2] + '@2x';
				file = '';
				for (var i = 0; i < rImgTemp_length; i++){
					file += rImgTemp[i] + ((i < rImgTemp_length-1) ? '.' : '');
				}

				return file;
			};

			if (multiImageBln){
				// retina handling
				if (retina){
					img[0] = processRetinaImage(img[0]);
					img[1] = processRetinaImage(img[1]);
				}

				for (var ki = 0; ki < knobs.length; ki++){
					knobs[ki].innerHTML = '<img src="" style="visibility:hidden; position:absolute" />';

					/*var image = new Image();
					image.onload = imageLoad;
					image.src = path;
					knobs[ki].appendChild(image);*/
				}

				var newImage = null;//new Image();
				var multiImageIndex = 0;
				var loadNextImage = function(el){
					newImage = el.children[0];
					newImage.setAttribute('src', img[multiImageIndex]);
					newImage.onload = function(){
						var thisHeight = newImage.naturalHeight;

						if (retina){
							newImage.style.width	= (newImage.naturalWidth/2)+'px';
							thisHeight				= newImage.offsetHeight;
							knob_width_css			= newImage.offsetWidth+'px';
							knob_height_css			= thisHeight+'px';
						} else {
							knob_width_css			= newImage.naturalWidth+'px';
							knob_height_css			= thisHeight+'px';
						}

						knob_bg = 'url('+img[multiImageIndex]+') no-repeat';

						// apply knob image styles
						el.style.width		= knob_width_css;
						el.style.height		= knob_height_css;
						el.style.background	= knob_bg;
						if (retina) el.style.backgroundSize = '100%';

						el.removeChild(newImage);

						if (multiImageIndex < 1){
							multiImageIndex++;
							loadNextImage(knob2);
						} else {
							for (var ib = 0; ib < knobs.length; ib++){
								css(follows[ib], {
									'height': knob_height_css,
									'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0'
								});
							}
							css(self, {
								'height': knob_height_css,
								'border-radius': r_corners ? thisHeight / 2 + 'px' : '0'
							});

							imgLoaded = true;

							var settings_height = settings.height;
							if (thisHeight > settings_height){
								var knobMarginValue = (thisHeight-settings_height)/2;
								
								self.style.height = settings_height+'px';

								for (ib = 0; ib < knobs.length; ib++){
									knobs[ib].style.top				= '-'+knobMarginValue+'px';
									follows[ib].style.height		= settings_height+'px';
									follows[ib].style.borderRadius	= r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0';
								}
							} else {
								// children stay inside parent
								self.style.overflow = 'hidden';
							}

							window.dispatchEvent(eventMakeReady);
						}
					};
				};
				loadNextImage(knob1);
			} else {
				// retina handling
				if (retina) img = processRetinaImage(img);

				for (var ki = 0; ki < knobs.length; ki++)
					knobs[ki].innerHTML = '<img src="'+img+'" style="visibility:hidden; position:absolute" />';

				knob1.children[0].onload = function(){
					var imgEl = [];

					for (var ic = 0; ic < knobs.length; ic++) {
						imgEl.push(knobs[ic].children[0]);
						var thisHeight = imgEl[ic].naturalHeight;

						if (retina){
							imgEl[ic].style.width	= (imgEl[ic].naturalWidth/2)+'px';
							thisHeight				= imgEl[ic].offsetHeight;
							knob_width_css			= imgEl[ic].offsetWidth+'px';
							knob_height_css			= thisHeight+'px';
						} else {
							knob_width_css			= imgEl[ic].naturalWidth+'px';
							knob_height_css			= thisHeight+'px';
						}

						knob_bg = 'url('+img+') no-repeat';

						// apply knob image styles
						knobs[ic].style.width		= knob_width_css;
						knobs[ic].style.height		= knob_height_css;
						knobs[ic].style.background	= knob_bg;
						if (retina) knobs[ic].style.backgroundSize = '100%';

						css(follows[ic], {
							'height': knob_height_css,
							'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0'
						});
						// style only once
						if (ic === 0){
							css(self, {
								'height': knob_height_css,
								'border-radius': r_corners ? thisHeight / 2 + 'px' : '0'
							});
						}

						knobs[ic].removeChild(imgEl[ic]);

						var settings_height = settings.height;
						if (thisHeight > settings_height){
							var knobMarginValue = (thisHeight-settings_height)/2;
									
							self.style.height				= settings_height+'px';
							knobs[ic].style.top				= '-'+knobMarginValue+'px';
							follows[ic].style.height		= settings_height+'px';
							follows[ic].style.borderRadius	= r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0';
						} else {
							// children stay inside parent
							self.style.overflow = 'hidden';
						}
					}

					window.dispatchEvent(eventMakeReady);
				};
			}
		} else {
			var d = settings.height / 2;
			css(self, {'border-radius': (r_corners ? d+'px' : '0'), 'overflow': 'hidden'});
			for (var i = 0; i < knobs.length; i++)
				css(follows[i], {'border-radius': (r_corners ? d+'px 0 0 '+d+'px' : '0')});

			setTimeout(function(){
				for (var i = 0; i < knobs.length; i++)
					knobs[i].style.backgroundColor = knob_bg;	// IE patch

				window.dispatchEvent(eventMakeReady);
			}, 0);
		}

		//------------------------------------------------------------------------------------------------------------------------------------
		// styles

		// validate some user settings
		var width = settings.width;
		var unit = (!settings.unit && !vert) ? '%' : 'px';

		if (unit === 'px') width = Math.round(width);
		else if (unit === '%' && Math.round(width) > 100) width = 100;

		var cssPrefixes = [
				'-webkit-',
				'-khtml-',
				'-moz-',
				'-ms-',
				'-o-',
				''
			],
			cssBorderBox	= {'box-sizing': 'border-box'},
			cssContentBox	= {'box-sizing': 'content-box'},
			cssUserSelect	= {'user-select': 'none'},
			cssRotate		= {'transform': 'rotate(-90deg)'};

		css(self, {
			'width': width + unit,
			'height': self_height,
			'text-align': 'left',
			'margin': 'auto',
			'z-index': '997',
			'position': 'relative',
			'-webkit-touch-callout': 'none'
		});
		css(self, clone(cssContentBox), cssPrefixes);
		css(self, clone(cssUserSelect), cssPrefixes);

		var self_width = self.offsetWidth;

		for (var ia = 0; ia < knobs.length; ia++){
			css(knobs[ia], {
				'width': knob_width_css,
				'background': knob_bg,
				'height': knob_height_css,
				'display': 'inline-block',
				'visibility': (!settings.noHandle ? 'visibe' : 'hidden'),
				'cursor': (!settings.disabled ? 'pointer' : 'default'),
				'font-size': '0',
				'position': 'relative',
				'z-index': '2'
			}, null, 'knobby');
			css(knobs[ia], clone(cssContentBox), cssPrefixes);

			css(follows[ia], {
				'position': 'absolute',
				'height': 'inherit',
				'width': '0',
				'z-index': (ia === 1) ? '0' : '1'
			});
			css(follows[ia], clone(cssContentBox), cssPrefixes);
		}

		//------------------------------------------------------------------------------------------------------------------------------------
		// snap marks, buttons, vertical

		var preSnap = function(){
			// snap to nearest point on hard or snapOffset
			var was_locked = isLocked;
			if (was_locked) isLocked = false;

			if (snapType === 'hard'){
				target = knob1;
				snapDragon(knob1.offsetLeft);
				target = knob2;
				snapDragon(knob2.offsetLeft);
			} else if (snapType === 'soft'){
				var snapKnobs = function(el){
					moved = true;
					target = el;
					doSnap('soft', el.offsetLeft);
				};

				snapKnobs(knob1);
				snapKnobs(knob2);
			}

			if (was_locked) isLocked = true;

			startAt = THE_VALUES = getPercent(knob1.data('px'), knob2.data('px'));
		};

		// snap to
		var snaps = Math.round(settings.snap.points);
		var marks = null;
		var snapPctValues = [0];
		var snapPxlValues = [0];

		var setPixelValues = function(sw, kw){
			snapPxlValues = [0];
			var increment = sw / (snaps - 1);
			var step = increment;

			while (step <= sw){
				snapPxlValues.push(step);
				step += increment;
			}
		};

		var setSnapValues = function(){
			if (snaps === 1) snaps = 2;

			// pixel
			var kw = Math.round((knob1.offsetWidth + knob2.offsetWidth) / 2);
			var sw = Math.round(self_width - kw * 2);
			// snapPxlValues[0] += kw;

			setPixelValues(sw, kw);

			// percentage
			for (var i = 1; i < snapPxlValues.length; i++){
				snapPctValues.push(snapPxlValues[i] / sw * 100);
			}

			snapPctValues[snapPctValues.length-1] = 100;

			if (markers) drawSnapmarks();
		};

		var drawSnapmarks = function(){
			var kw_ = knob1.offsetWidth;

			self.insertAdjacentHTML('afterend', '<div id="'+guid+'_markers" class="sglide-markers"></div>');
			marks = $('#'+guid+'_markers')[0];

			css(marks, {
				'position': 'relative',
				'width': self_width+'px', //settings.width + unit,
				'margin': 'auto',
				'-webkit-touch-callout': 'none',
				'box-sizing': 'border-box'
			});

			css(marks, clone(cssUserSelect), cssPrefixes);

			if (marks){
				var str = '';
				var val = null;

				// for (var i = 0; i < snapValues.length; i++){
				for (var i = snaps - 1; i >= 0; i--){
					val = (self_width - kw_*2) / (snaps-1) * i + kw_;
					// str += '<div style="display:inline-block; width:0; height:5px; border-left:#333 solid 1px; position:relative; left:'+val+'px; float:left"></div>';
					str += '<div style="width:0; height:5px; border-left:#333 solid 1px; position:absolute; left:'+val+'px"></div>';
				}

				marks.innerHTML = str;
			}
		};

		// -----------

		// vertical
		var verticalTransform = function(){
			var vertWidth = Math.round(self.offsetWidth / 2);
			var vertHeight = Math.round(self.offsetHeight / 2);

			cssRotate.transform += ' translate(-'+Math.abs(vertWidth - vertHeight)+'px, 0)';

			if (markers && is_snap){
				var a = [self, $('#'+guid+'_markers')[0]];

				wrapAll(a, '<div id="'+guid+'_vert-marks" style="margin:0; z-index:997; width:'+width+unit+
					'; -webkit-backface-visibility:hidden; -moz-backface-visibility:hidden; -ms-backface-visibility:hidden; backface-visibility:hidden; display:inline-block"></div>');

				vmarks = $('#'+guid+'_vert-marks')[0];

				css(self, {'width': '100%'});
				css(vmarks, clone(cssContentBox), cssPrefixes);
				css(vmarks, clone(cssRotate), cssPrefixes);
				css(vmarks, {'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'});
				css(vmarks, {'transform-origin': vertWidth+'px '+vertHeight+'px'}, cssPrefixes);

				for (var i = 0; i < a.length; i++)
					css(a[i], {'margin': '0'});
			} else {
				// check whether even by even or odd by odd to fix blurred elements
				css(self, {'margin': '0', 'top': '0', 'left': '0', 'display': 'inline-block'});
				css(self, {'backface-visibility': 'hidden'}, cssPrefixes);
				css(self, clone(cssRotate), cssPrefixes);
				css(self, {'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'});
				css(self, {'transform-origin': vertWidth+'px '+vertHeight+'px'}, cssPrefixes);
			}
			self.classList.add('vertical');
		};

		//------------------------------------------------------------------------------------------------------------------------------------
		// events

		var is_down	= false,
			target	= null,

			barDrag = false,
			z		= null;

		// snapping
		var storedSnapValues = THE_VALUES;	//[-1, -1];
		var is_same = false;
		var storedBarSnapValue = null;
		var is_onSnapPoint = false;
		var was_onSnapPoint_left = true;
		var was_onSnapPoint_right = true;
		var simulSnap = false;
		var moved = false;

		var doSnap = function(kind, m){
			if (is_snap){
				var sense = settings.snap.sensitivity;

				// although snap is enabled, sensitivity may be set to nill, in which case marks are drawn but won't snap to
				if (sense || snapType === 'hard' || snapType === 'soft'){
					var knobWidthHalf		= target.offsetWidth,
						knobWidth			= knobWidthHalf * 2,
						knobWidthQuarter	= knobWidthHalf / 2,
						snapOffset			= (sense && sense > 0 && sense < 4 ? (sense + 1) * 5 : 15) - 3;

					// get closest px mark, and set %
					var closest = null, pctVal = 0, num = 0;
					for (var i = 0; i < snapPxlValues.length; i++){
						num = snapPxlValues[i];
						if (closest === null || Math.abs(num - m) < Math.abs(closest - m)){
							closest = num;// | 0.0;
							pctVal = snapPctValues[i];
						}
					};

					// if locked, get closest mark for other knob
					if (/*isLocked || */barDrag || barDrag_drop){
						var closest_n = null, pctVal_n = 0, n = 0;

						if (target === knob1) n = m + lockedDiff - target.offsetWidth;
						else n = m - lockedDiff;

						// $.each(snapPxlValues, function(i, num){
						for (var i = 0; i < snapPxlValues.length; i++){
							num = snapPxlValues[i];
							if (closest_n === null || Math.abs(num - n) < Math.abs(closest_n - n)){
								closest_n = num;// | 0;
								pctVal_n = snapPctValues[i];
							}
						}
					}

					// ----------------------------------------------------
					// physically snap it

					var boolN = false;
					var lockedRangeAdjusts = function(){
						// first compare which is closer: m or n
						// if n, m = n, closest = closest_n
						// if locked & startAts different
						if ((/*isLocked || */barDrag) && settings.startAt[0] !== settings.startAt[1]){
							// snap other, else snap current knob
							var currentKnobToClosest = Math.abs(closest - m + knobWidthHalf);
							var otherKnobToClosest = Math.abs(closest_n - n);

							simulSnap = Math.abs(currentKnobToClosest - otherKnobToClosest) < 1 && is_onSnapPoint;

							if (currentKnobToClosest > otherKnobToClosest){
								boolN = true;
								closest = closest_n;
								m = (target === knob1) ? n-knobWidthQuarter : n;
							} else {
								m = (target === knob2) ? m-knobWidthHalf : m;
							}
						} else if (!isLocked && target === knob2) m -= knobWidthHalf;	// knob2 adjust
					};

					if (kind === 'drag'){
						if (snapType === 'hard'){

							if (barDrag){
								if (Math.abs(closest_n - knob1.offsetLeft) < Math.abs(closest - knob2.offsetLeft + knobWidthHalf)){
									target = knob1;
									// was_onSnapPoint_left = true;	// seems to work, not sure why
									snapUpdate(closest_n, knobWidth);
									was_onSnapPoint_right = true;
									target = knob2;// reset
								} else {
									// was_onSnapPoint_right = true;	// seems to work, not sure why
									snapUpdate(closest, knobWidth);
									was_onSnapPoint_left = true;
								}
							} else {
								switch (target){
									case knob1: was_onSnapPoint_left = true; break;
									case knob2: was_onSnapPoint_right = true; break;
								}

								snapUpdate(closest, knobWidth);
							}


						} else {	// true snap
							lockedRangeAdjusts();
							if (Math.round(Math.abs(closest - m + knobWidthHalf/8)) < snapOffset){
								is_onSnapPoint = true;
								snapUpdate(closest, knobWidth, boolN);
							} else {
								is_onSnapPoint = false;
								if (target === knob1 || barDrag && boolN) was_onSnapPoint_left = true;
								else if (target === knob2) was_onSnapPoint_right = true;
							}
						}
					} else {
						lockedRangeAdjusts();

						if (barDrag_drop || isLocked){
							if (moved){
								/*if (Math.abs(closest_n - knob1.offsetLeft) < Math.abs(closest - knob2.offsetLeft + knobWidthHalf)){
									target = knob1;
									was_onSnapPoint_left = true;	// seems to work, not sure why
									snapUpdate(closest_n, knobWidth);
									was_onSnapPoint_right = true;
									target = knob2;// reset
									moved = false;
									return closest_n;
								} else {
									was_onSnapPoint_right = true;	// seems to work, not sure why
									snapUpdate(closest, knobWidth);
									was_onSnapPoint_left = true;
									moved = false;
									return closest;
								}*/
								if (target === knob2){
									was_onSnapPoint_right = true;
									snapUpdate(closest, knobWidth);
									was_onSnapPoint_left = true;
									moved = false;
									return closest;
								} else {
									was_onSnapPoint_left = true;
									snapUpdate(closest, knobWidth);
									was_onSnapPoint_right = true;
									moved = false;
									return closest;
								}
							}
						} else {	// single knob drag
							if (moved){
								switch (target){
									case knob1: was_onSnapPoint_left = true; break;
									case knob2: was_onSnapPoint_right = true; break;
								}

								snapUpdate(closest, knobWidth);
								moved = false;
								return closest;
							}
						}

					}
				}
			}
		}, snapOutput = function(which, closest){ // callback: onSnap
			if (snapType === 'hard'){
				var p = null;
				switch (which){
					case 0:
						p = getPercent(closest, null)[0];
						if (p === storedSnapValues[0]) return false;
						break;
					case 1:
						p = getPercent(null, closest)[1];
						if (p === storedSnapValues[1]) return false;
						break;
				}
			}

			setResults();

			var is_same = false;
			var pcts = null;

			// which handle?
			switch (which){
				case 0:
					pcts = getPercent(closest, (knob2.data('px') ? knob2.data('px') : result_to));
					break;
				case 1:
					pcts = getPercent((knob1.data('px') ? knob1.data('px') : result_from), closest);
					break;
			}

			// callback
			if (options.onSnap && !is_same){
				storedSnapValues = pcts;
				options.onSnap.call(self, updateME.apply(that, pcts));
			}

		}, snapUpdate = function(closest, knobWidth, isN){
			var getFollowPos = function(){
				return (closest+knobWidth/4+knobWidth/2);
			};
			
			var followPos = getFollowPos();
			var diff = null;

			// -----------------------------

			if ((target === knob1 && !isN) || (target === knob2 && isN)){
				diff = function() { return (closest+lockedDiff-knobWidth/2); };

				// patch: constraint right: if new knob2 pos > end knob2 pos, set new closest value;
				if ((isLocked || barDrag || barDrag_drop) && diff() > (self_width - knobWidth))
					closest -= diff() - (self_width - knobWidth);
				else

				// constrain left knob to left side - glitch most evident at hard snap
				// a prior constraint is already set, but you need this extra one - leave it active
				if (closest > knob2.offsetLeft - (knobWidth/2))// && snapType === 'hard')
					closest = knob2.offsetLeft - (knobWidth/2);

				css(knob1, {'left': closest}).data('px', closest);
				css(follow1, {'width': (closest+knobWidth/4)});

				if (isLocked || barDrag || barDrag_drop){
					css(knob2, {'left': diff()}).data('px', diff());
					css(follow2, {'width': (closest+knobWidth/4+lockedDiff)});
				}

				// output
				if (was_onSnapPoint_left && !simulSnap){
					snapOutput(0, closest);
					was_onSnapPoint_left = false;
					was_onSnapPoint_right = is_onSnapPoint;	// must on hard-snap; but causes double snap when both knob snapped
				}
			} else {
				diff = function(){ return closest-lockedDiff+knobWidth/2; };

				// patch: constraint left: if new knob1 pos < 0, set new closest value;
				if ((isLocked || barDrag || barDrag_drop) && (closest-lockedDiff+knobWidth/2) <= 0)
					// closest -= closest-lockedDiff+knobWidth/2;
					closest -= diff();
				else

				// constrain right knob to right side - glitch most evident at hard snap
				// a prior constraint is already set, but you need this extra one - leave it active
				if (closest < knob1.offsetLeft)// && snapType === 'hard')
					closest = knob1.offsetLeft;

				followPos = getFollowPos();

				css(knob2, {'left': closest}).data('px', closest);
				css(follow2, {'width': followPos});

				if (isLocked || barDrag || barDrag_drop){
					css(knob1, {'left': diff()}).data('px', diff());
					css(follow1, {'width': (followPos-lockedDiff)});
				}

				// output
				if (was_onSnapPoint_right && !simulSnap){
					snapOutput(1, closest);
					was_onSnapPoint_right = false;
					was_onSnapPoint_left = is_onSnapPoint;	// must on hard-snap; but causes double snap when both knob snapped
				}
			}
		};

		if (isMobile){
			eventDocumentMouseDown = function(e){
				// is_down = false;
				touchX = e.targetTouches[0].pageX;
				touchY = e.targetTouches[0].pageY;
			};
			document.addEventListener(mEvt.down, eventDocumentMouseDown);
		}

		var z = null;
		var a = false, b = false; // used to mitigate constraint checkers
		var barDrag_drop = false;

		// get absolute position
		// https://stackoverflow.com/questions/1480133/how-can-i-get-an-objects-absolute-position-on-the-page-in-javascript
		var cumulativeOffset = function(element){
			var top = 0, left = 0;
			do {
				top += element.offsetTop  || 0;
				left += element.offsetLeft || 0;
				element = element.offsetParent;
			} while(element);

			return {
				top: top,
				left: left
			};
		};

		eventDocumentMouseMove = function(e){
			if (is_down){
				e = e || event;	// ie fix
				moved = true;

				var x			= null,
					knobWidth	= (knob1.offsetWidth + knob2.offsetWidth) / 2;

				if (vert){
					// var base = self.offsetTop + self_width;
					// var base = self.parentNode.offsetTop + self_width;
					var base = cumulativeOffset(self).top + self_width;
					if (isMobile){
						touchY = e.originalEvent.touches[0].pageY;
						x = base - touchY;
					} else x = base - e.pageY;
				} else {
					if (isMobile){
						touchX = e.originalEvent.touches[0].pageX;
						x = touchX - self.offsetLeft;
					} else x = e.pageX - self.offsetLeft;
				}

				if (barDrag){
					if (z === null) z = target.offsetLeft - x + (knobWidth / 2);
					x += z;
					if (!gotLockedPositions) getLockedPositions();
				}

				var stopper = knobWidth / 2;
				var m = x - stopper;

				if (e.returnValue) e.returnValue = false;

				if (!isLocked && !barDrag){
					if (target === knob1){
						var knob2_style_left	= knob2.data('px');
						var knob2_offset_left	= knob2.offsetLeft;

						if (x <= stopper && (!is_snap || snapType !== 'hard')){
							if (b) b = false;
							if (!a){
								css(knob1, {'left': 0}).data('px', 0);
								css(follow1, {'width': stopper});
								a = true;
							}
						} else if (x >= knob2_offset_left-stopper && (!is_snap || snapType !== 'hard')){
							if (a) a = false;
							if (!b){
								css(knob1, {'left': knob2_style_left}).data('px', knob2_style_left);
								css(follow1, {'width': (knob2_offset_left-stopper)});
								if (snapType === 'hard') snapOutput(getPercent([result_from, result_to]).percentRange[1], 'from');
								b = true;
							}
						} else {
							a = b = false;
							css(knob1, {'left': (x-stopper)}).data('px', (x-stopper));
							css(follow1, {'width': x});
							snapDragon(m);
						}
					} else if (target === knob2){
						var knob1_style_left	= knob1.data('px');
						var knob1_offset_left	= knob1.offsetLeft;

						if (x <= knob1_offset_left+stopper+knobWidth && (!is_snap || snapType !== 'hard')){
							if (b) b = false;
							if (!a){
								css(knob2, {'left': knob1_style_left}).data('px', knob1_style_left);
								css(follow2, {'width': (knob1_offset_left+stopper+knobWidth)});
								if (snapType === 'hard') snapOutput(getPercent([result_from, result_to]).percentRange[0], 'to');
								a = true;
							}
						} else if (x >= self_width-stopper && (!is_snap || snapType !== 'hard')){
							if (a) a = false;
							if (!b){
								css(knob2, {'left': (self_width-knobWidth*2)}).data('px', (self_width-knobWidth*2));
								css(follow2, {'width': (self_width-stopper)});
								b = true;
							}
						} else {
							a = b = false;
							css(knob2, {'left': (x-stopper-knobWidth)}).data('px', (x-stopper-knobWidth));
							css(follow2, {'width': x});
							snapDragon(m);
						}
					}
				} else {
					if (target === knob1){
						if (x <= stopper && (!is_snap || snapType !== 'hard')){
							if (b) b = false;
							if (!a){
								css(knob1, {'left': 0}).data('px', 0);
								css(follow1, {'width': stopper});

								css(knob2, {'left': (lockedDiff-knobWidth)}).data('px', (lockedDiff-knobWidth));
								css(follow2, {'width': (lockedDiff+stopper)});
								a = true;
							}
						} else if (x >= self_width-lockedDiff-stopper && (!is_snap || snapType !== 'hard')){
							if (a) a = false;
							if (!b){
								css(knob2, {'left': (self_width-knobWidth*2)}).data('px', (self_width-knobWidth*2));
								css(follow2, {'width': (self_width-stopper)});

								css(knob1, {'left': (self_width-lockedDiff-knobWidth)}).data('px', (self_width-lockedDiff-knobWidth));
								css(follow1, {'width': (self_width-lockedDiff-stopper)});
								b = true;
							}
						} else {
							a = b = false;
							css(knob1, {'left': (x-stopper)}).data('px', (x-stopper));
							css(follow1, {'width': x});

							css(knob2, {'left': (x-stopper-knobWidth+lockedDiff)}).data('px', (x-stopper-knobWidth+lockedDiff));
							css(follow2, {'width': (x+lockedDiff)});
							snapDragon(m);
						}
					} else if (target === knob2){
						if (x <= lockedDiff+stopper && (!is_snap || snapType !== 'hard')){
							if (b) b = false;
							if (!a){
								css(knob2, {'left': (lockedDiff-knobWidth)}).data('px', (lockedDiff-knobWidth));
								css(follow2, {'width': (lockedDiff+stopper)});

								css(knob1, {'left': 0}).data('px', 0);
								css(follow1, {'width': stopper});
								a = true;
							}
						} else if (x >= self_width-stopper && (!is_snap || snapType !== 'hard')){
							if (a) a = false;
							if (!b){
								css(knob2, {'left': (self_width-knobWidth*2)}).data('px', (self_width-knobWidth*2));
								css(follow2, {'width': (self_width-stopper)});

								css(knob1, {'left': (self_width-lockedDiff-knobWidth)}).data('px', (self_width-lockedDiff-knobWidth));
								css(follow1, {'width': (self_width-lockedDiff-stopper)});
								b = true;
							}
						} else {
							a = b = false;
							css(knob2, {'left': (x-stopper-knobWidth)}).data('px', (x-stopper-knobWidth));
							css(follow2, {'width': x});

							css(knob1, {'left': (x-stopper-lockedDiff)}).data('px', (x-stopper-lockedDiff));
							css(follow1, {'width': (x-lockedDiff)});
							snapDragon(m);
						}
					}
				}

				// results
				setResults();

				// update values
				if (options.drag && self.data('state') === 'active'){
					var value = updateME.apply(that, getPercent(result_from, result_to));
					THE_VALUES = value.percentRange;
					options.drag.call(self, value);
				}
			}
		};
		eventDocumentMouseUp = function(e){
			barDrag_drop = barDrag;
			var state = self.data('state');
			is_down = barDrag = gotLockedPositions = a = b = false;
			z = null;
			if (state === 'active'){
				if (snapType !== 'hard'){
					e = e || event;	// ie fix
					var x = null, base = 0;
					var knobWidth	= (knob1.offsetWidth + knob2.offsetWidth) / 2;

					if (vert){
						base = self.offsetTop + self_width;
						x = base - ((!isMobile ? e.pageY : touchY)-2);
					} else x = (!isMobile ? e.pageX : touchX) - self.offsetLeft;

					if (barDrag_drop){
						if (z === null) z = target.offsetLeft - x + (knobWidth / 2);
						x += z;
						if (!gotLockedPositions) getLockedPositions();
					}

					var stopper		= (target === knob2) ? knobWidth * 1.5 : knobWidth / 2;
					var m			= x - stopper;	// true position of knob

					// snap to
					if (barDrag_drop && snapType === 'soft') doSnap('soft', x);
					else {
						if (is_snap && snapType === 'soft'){
							if (target === knob1 && m <= knob2.offsetLeft)
								result_from = doSnap('soft', m);
							else if (target === knob2 && m >= knob1.offsetLeft)
								result_to = doSnap('soft', m);
						}
					}

					var value = updateME.apply(that, getPercent(result_from, result_to));
					THE_VALUES = value.percentRange;

					if (options.drop) options.drop.call(self, value);
					if (options.drag && state === 'active') options.drag.call(self, value);
				}
				self.data('state', 'inactive');
			}
			gotLockedPositions = barDrag_drop = false;
			z = null;
		};

		var eventWindowResize = function(){
			if (!vert){
				self_width = Math.round(self.offsetWidth);

				var val = null;
				var kw1	= knob1.offsetWidth;
				var pos	= (function(arr){
					for (var i = 0; i < THE_VALUES.length; i++){
						arr.push(THE_VALUES[i] / 100 * (self_width - kw1) + (kw1/2));
					}
					return arr;
				})([]);

				that.startAt(THE_VALUES);

				if (marks){
					setPixelValues((self_width - kw1 * 2), kw1);
					css(marks, {'width': self_width+'px'});

					var divArray = Array.prototype.slice.call(marks.children);
					for (var i = divArray.length - 1; i >= 0; i--){
						val = (self_width - kw1*2) / (snaps-1) * i + kw1;
						divArray[i].style.left = val+'px';
					}
				}
			}
		};

		var eventKnobMouseDown = function(e){
			target = e.target;
			is_down = true;
			self.data('state', 'active');
		};

		var eventKnobMouseUp = function(){
			is_down = false;
		};

		var snapDragon = function(m){
			if (is_snap && !snapType || snapType === 'hard') doSnap('drag', m);
		}

		var initEventHandlers = function(){
			// init touch event handlers
			if (isMobile && !settings.disabled){
				document.addEventListener(mEvt.down, function(e){
					touchX = e.originalEvent.touches[0].pageX;
					touchY = e.originalEvent.touches[0].pageY;
				});
			}

			// init event handlers
			if (!settings.disabled){
				knob1.addEventListener(mEvt.down, eventKnobMouseDown);
				knob2.addEventListener(mEvt.down, eventKnobMouseDown);
				knob1.addEventListener(mEvt.up, eventKnobMouseUp);
				knob2.addEventListener(mEvt.up, eventKnobMouseUp);

				document.addEventListener(mEvt.move, eventDocumentMouseMove);
				document.addEventListener(mEvt.up, eventDocumentMouseUp);

				follow2.addEventListener(mEvt.down, function(){
					is_down = barDrag = true;
					target = knob2;
					self.data('state', 'active');
				});
				follow2.addEventListener(mEvt.up, function(){
					is_down = false;
				});
			}

			window.addEventListener('resize', eventWindowResize);
		}

		//------------------------------------------------------------------------------------------------------------------------------------
		// functions

		var setResults = function(){
			result_from	= knob1.data('px') || knob1.offsetLeft || 0;
			result_to	= knob2.data('px') || (knob2.offsetLeft - knob2.offsetWidth) || 0;
		};

		// set locked positions
		var lockedKnob1Pos		= null,
			lockedKnob2Pos		= null,
			lockedDiff			= null,
			gotLockedPositions	= false,
			getLockedPositions	= function(){
				lockedKnob1Pos	= knob1.data('px') || knob1.offsetLeft;
				lockedKnob2Pos	= knob2.data('px') || knob2.offsetLeft;
				lockedDiff		= lockedKnob2Pos - lockedKnob1Pos + knob2.offsetWidth;
				gotLockedPositions = true;
			};

		if (customRange){
			var cstmStart = settings.totalRange[0];
			var diff = settings.totalRange[1] - cstmStart;
		}
		
		var getPercent = function(a, b){
			var sw = self_width - knob1.offsetWidth - knob2.offsetWidth;
			var pctA = null, pctB = null;

			if (a || a === 0){
				pctA = a / sw * 100;
				pctA = Math.min(pctA, 100);
			}

			if (b || b === 0){
				pctB = b / sw * 100;
				pctB = Math.min(pctB, 100);
			}

			return [pctA, pctB];
		};

		var updateME = function(_from, _to){
			// set data to send
			var sendData = {'percentRange': [_from, _to]};

			// calculate unit
			if (customRange){
				var toCustom = function(pct){
					return diff * pct / 100 + cstmStart;
				};
				sendData.customRange = [toCustom(_from), toCustom(_to)];
			}

			return sendData;
		};

		//------------------------------------------------------------------------------------------------------------------------------------
		// start

		var setStartAt = function(){
			window.removeEventListener('makeready.'+guid, setStartAt);

			// load object
			that.startAt(startAt);
			setResults();

			// inits
			initEventHandlers();

			if (is_snap)		setSnapValues();
			if (vert)			verticalTransform();
			if (snapType === 'hard' || snapType === 'soft') preSnap();
			if (isLocked)		getLockedPositions();
			// if (options.onload)	options.onload(rlt);

			var rlt = updateME.apply(that, startAt);
			// rlt.instance = that;

			// on ready
			if (callback) callback.call(that, rlt);
		};

		//Listen to your custom event
		var eventMakeReady = new CustomEvent('makeready.'+guid);
		window.addEventListener('makeready.'+guid, setStartAt);
	})(document, this);
}