/*global window:false, console:false, document:false, event:false, jQuery:false */

/***********************************************************************************

author:		Daniel Kazmer - http://iframework.net
created:	11.11.2014
version:	1.0.1

	version history:
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
				points		: 0
			},
			disabled:				// boolean - default: false
			vertical:				// boolean - default: false
			drop/drag/onSnap/onload: function(o){
				console.log('returned object',o);
			}
		});

		all properties are optional, however, to retrieve data, use one of the callbacks

	goals:
		- test: positions of locked handles when startAt point specified
		- snap either handle when dragging one when locked
		- draggable space between handles when locked
		- if unit is %, then markers should be also
		- fix bug: rebuilding vertical rotates again

***********************************************************************************/

function sGlideRange(self, options){

	//------------------------------------------------------------------------------------------------------------------------------------
	// global variables

	var knobs		= null,
		knob1		= null,
		knob2		= null,
		follows		= null,
		follow1		= null,
		follow2		= null,
		startAt		= 0,
		img			= '',
		isMobile	= false,
		// events
		eventDocumentMouseUp	= null,
		eventDocumentMouseMove	= null,
		eventDocumentMouseDown	= null,
		eventKnobMouseUp		= null,
		eventKnobMouseDown		= null,
		eventWindowResize		= null,
		// event states prelim
		mEvt	= {
			'down'	: 'mousedown',
			'up'	: 'mouseup',
			'move'	: 'mousemove'
		};

	this.element = self;

	// CustomEvent polyfill for IE
	if (!(CustomEvent instanceof Function)){
		(function(){
			function CustomEvent(event, params){
				params = params || { bubbles: false, cancelable: false, detail: undefined };
				var evt = document.createEvent('CustomEvent');
				evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
				return evt;
			}

			CustomEvent.prototype = window.Event.prototype;
			window.CustomEvent = CustomEvent;
		})();
	}

	//------------------------------------------------------------------------------------------------------------------------------------
	// public methods

	this.destroy = function(){
		var guid = self.getAttribute('id');

		// unwrap vertical buttons
		var vertContainer = get('#'+guid+'_vert-marks');
		if (vertContainer){
			var vertParent = vertContainer.parentNode;
			vertParent.insertBefore(self, vertContainer.nextSibling);
			vertParent.removeChild(vertContainer);
		}

		var markers = get('#'+guid+'_markers');
		if (markers) markers.parentNode.removeChild(markers);

		if (isMobile){
			document.removeEventListener(mEvt.down, eventDocumentMouseDown);
		} else if (keyCtrl || keyCtrlShift){
			document.removeEventListener('keydown', eventDocumentKeyDown);
			document.removeEventListener('keyup', eventDocumentKeyUp);
		}

		document.removeEventListener(mEvt.move, eventDocumentMouseMove);
		document.removeEventListener(mEvt.up, eventDocumentMouseUp);
		window.removeEventListener('resize', eventWindowResize);
		window.removeEventListener('orientationchange', eventWindowResize);
		knob.removeEventListener(mEvt.up, eventKnobMouseUp);
		knob.removeEventListener(mEvt.down, eventKnobMouseDown);
		self.removeChild(knob);
		self.removeChild(follow);
		self.removeAttribute('style');
		self.removeAttribute('data-state');

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

		return this;
	};

	//------------------------------------------------------------------------------------------------------------------------------------
	// private global functions

	function get(id){
		switch (id[0]){
			case '#':	return document.getElementById(id.substr(1));
			case '.':	return document.getElementsByClassName(id.substr(1));
			default:	return document.getElementsByTagName(id);
		}
	}

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

	function extend(a, b, isCss){
		var c = isCss ? b : {};
		// for (var p in a) c[p] = (b[p] == null) ? a[p] : b[p];
		for (var p in a){
			if (b[p] instanceof Array){
				c[p] = [];
				for (var i = 0; i < b[p].length; i++){
					if (typeof b[p][i] == 'object') extend(a[p][i], b[p][i]);
					else c[p].push(b[p][i]);
				}
			}
			else if (typeof b[p] == 'object') c[p] = extend(a[p], b[p]);
			else c[p] = (b[p] === undefined) ? a[p] : b[p];
		}

		return c;
	}

	function css(el, styles, prefixes,e){
		var existingArr	= (el.getAttribute('style') ? el.getAttribute('style').split(';') : []),
			existingObj	= {},
			stl			= null;

		// create browser prefixes
		if (prefixes){
			var temp = {};
			for (var key in styles){
				if (styles.hasOwnProperty(key)){
					for (var j = 0; j < prefixes.length; j++){
						temp[prefixes[j]+key] = styles[key];
					}
				}
			}
			styles = temp;
		}

		// create string
		for (var i = 0; i < existingArr.length; i++){
			stl = existingArr[i].split(':');
			if (stl.length < 2) break;
			existingObj[stl[0].trim()] = stl[1].trim();
		}

		// format and set style
		if (Object.keys(existingObj).length === 0) existingObj = styles;
		var str = JSON.stringify(extend(existingObj, styles, true)).replace(/\{*\}*"*/g, '').replace(/,/g, '; ') || '';
		el.setAttribute('style', str.trim());
	}

	(function(document, that, $){

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
			'startAt'		: 0,
			'image'			: 'none',	// full path of image
			'height'		: 40,
			'width'			: 100,
			'unit'			: '%',	// 'px' or '%'
			'pill'			: true,
			'snap'			: {
				'marks'		: false,
				'type'		: false,
				'points'	: 0,
				'sensitivity': 2
			},
			'disabled'		: false,
			'vertical'		: false,
			'totalRange'	: [0,0],
			'retina'		: true,
			'locked'		: false
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

		// local variables
		var THE_VALUES		= startAt = settings.startAt,
			result_from		= 0,
			result_to		= 0,
			vert			= settings.vertical,
			markers			= (settings.snap.points > 0 && settings.snap.points <= 9 && settings.snap.marks),
			snapType		= (settings.snap.type != 'hard' && settings.snap.type != 'soft') ? false : settings.snap.type,
			knob_bg			= '#333',
			knob_width_css	= (!settings.disabled ? '2%' : '0'),
			knob_height_css	= 'inherit',
			self_height		= Math.round(settings.height)+'px',
			r_corners		= settings.pill,
			imageBln		= (settings.image != 'none' && settings.image !== '' && !settings.disabled),
			retina			= (window.devicePixelRatio > 1) && settings.retina,
			customRange		= (settings.totalRange[0] !== 0 || settings.totalRange[1] !== 0) && settings.totalRange[0] < settings.totalRange[1],
			MSoffsetTop		= null,
			vmarks			= null,
			isLocked		= settings.locked;

		//------------------------------------------------------------------------------------------------------------------------------------
		// image handling

		if (imageBln){	// if image
			img = settings.image;

			// string or array
			var multiImageBln = (img instanceof Array) ? true : false;

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

				for (var ki = 0; ki < knobs.length; ki++)
					knobs[ki].innerHTML = '<img src="" style="visibility:hidden; position:absolute" />';

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
								
								self.style.height			= settings_height+'px';
								for (ib = 0; ib < knobs.length; ib++){
									knobs[ib].style.top				= '-'+knobMarginValue+'px';
									follows[ib].style.height		= settings_height+'px';
									follows[ib].style.borderRadius	= r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0';
								}
							} else {
								// children stay inside parent
								self.style.overflow = 'hidden';
							}
						}

						window.dispatchEvent(eventMakeReady);
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
		var unit = settings.unit, width = settings.width;
		if (unit != 'px' && unit != '%') unit = '%';
		else if (unit == 'px') width = Math.round(width);
		else if (unit == '%' && Math.round(width) > 100) width = 100;

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

		if (vert) var vertWidth = self.offsetWidth;

		//------------------------------------------------------------------------------------------------------------------------------------
		// snap marks, buttons, vertical

		// snap to
		var snapping_on = false;
		var snaps = Math.round(settings.snap.points);
		var snapPctValues = [0];
		var drawSnapmarks = function(resize){
			if (snaps === 1) snaps = 2;
			
			// pixels
			var kw = knob1.offsetWidth*2;
			var w = self.offsetWidth - kw;
			var increment = w / (snaps - 1);
			var snapValues = [0];
			var step = increment;
			while (step <= w+2){	// added 2px to fix glitch when drawing last mark at 7 or 8 snaps (accounts for decimal)
				snapValues.push(step);
				step += increment;
			}
			// percentage
			increment = 100 / (snaps - 1);
			step = increment;
			while (step <= 101){	// added 1% to fix glitch when drawing last mark at 7 or 8 snaps (accounts for decimal)
				snapPctValues.push(step);
				step += increment;
			}

			snapping_on = true;

			// markers
			if (markers){
				var marks = null;
				if (!resize){
					// self.parentNode.insertBefore('<div id="'+guid+'_markers"></div>', self.nextSibling);
					self.insertAdjacentHTML('afterend', '<div id="'+guid+'_markers"></div>');
					
					marks = $('#'+guid+'_markers');
					
					css(marks, {
						'width': self.offsetWidth+'px', //settings.width + unit,
						'margin': 'auto',
						'padding-left': (kw/2)+'px',
						'-webkit-touch-callout': 'none'
					});
					css(marks, {'box-sizing': 'border-box'}, cssPrefixes);
					css(marks, {'user-select': 'none'}, cssPrefixes);
				} else {
					marks = $('#'+guid+'_markers');
					marks.innerHTML = '';
				}

				var str = '';

				for (var i = 0; i < snapValues.length; i++)
					str += '<div style="display:inline-block; width:0; height:5px; border-left:#333 solid 1px; position:relative; left:'+
						(snapValues[i]-i)+'px; float:left"></div>';

				marks.innerHTML = str;
			}
		};

		// -----------

		// vertical
		var verticalTransform = function(){
			if (markers && snaps > 0 && snaps < 10){
				var a = [self, $('#'+guid+'_markers')];

				wrapAll(a, '<div id="'+guid+'_vert-marks" style="margin:0; z-index:997; width:'+width+unit+
					'; -webkit-backface-visibility:hidden; -moz-backface-visibility:hidden; -ms-backface-visibility:hidden; backface-visibility:hidden"></div>');

				vmarks = $('#'+guid+'_vert-marks');

				css(self, {'width': '100%'});
				css(vmarks, clone(cssContentBox), cssPrefixes);
				css(vmarks, clone(cssRotate), cssPrefixes);
				css(vmarks, {'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'});
				css(vmarks, {'transform-origin': vertWidth+'px 0'}, cssPrefixes);

				for (var i = 0; i < a.length; i++)
					css(a[i], {'margin': '0'});
			} else {
				// check whether even by even or odd by odd to fix blurred elements
				css(self, {'margin': '0', 'top': '0', 'left': '0'});
				css(self, {'backface-visibility': 'hidden'}, cssPrefixes);
				css(self, clone(cssRotate), cssPrefixes);
				css(self, {'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'});
				css(self, {'transform-origin': vertWidth+'px 0'}, cssPrefixes);
			}
		};

		//------------------------------------------------------------------------------------------------------------------------------------
		// events

		// knob
		var is_down	= false;
		var target	= null;

		eventKnobMouseDown = function(e){
			target = e.currentTarget;
			is_down = true;
			self.setAttribute('data-state', 'active');
		};
		eventKnobMouseUp = function(){
			is_down = false;
		};

		if (!settings.disabled){
			for (ia = 0; ia < knobs.length; ia++){
				knobs[ia].addEventListener(mEvt.down, eventKnobMouseDown);
				knobs[ia].addEventListener(mEvt.up, eventKnobMouseUp);
			}
		}

		// snapping
		var storedSnapValues = ['a-1', 'b-1'];
		var doSnap = function(kind, m){
			if (snaps > 0 && snaps < 10){	// min 1, max 9
				var sense = settings.snap.sensitivity;

				// although snap is enabled, sensitivity may be set to nill, in which case marks are drawn but won't snap to
				if (sense || snapType === 'hard' || snapType === 'soft'){
					var knobWidthHalf		= target.offsetWidth,
						knobWidth			= knobWidthHalf * 2,
						knobWidthQuarter	= knobWidthHalf / 2,
						snapOffset			= (sense && sense > 0 && sense < 4 ? (sense + 1) * 5 : 15) - 3;

					// % to px
					var snapPixelValues = [];
					for (var j = 0; j < snapPctValues.length; j++){
						snapPixelValues.push((self_width - knobWidth) * snapPctValues[j] / 100);
					}

					// get closest px mark, and set %
					var closest = null, pctVal = 0;
					for (var i = 0; i < snapPixelValues.length; i++) {
						if (closest === null || Math.abs(snapPixelValues[i] - m) < Math.abs(closest - m)){
							closest = snapPixelValues[i];
							pctVal = snapPctValues[i];
						}
					}

					// if locked, get closest mark for other knob
					if (isLocked){
						var closest_n = null, pctVal_n = 0, n = 0;

						if (target === knob1) n = m + lockedDiff-knobWidthHalf*0.75; else n = m - lockedDiff;

						for (i = 0; i < snapPixelValues.length; i++) {
							if (closest_n === null || Math.abs(snapPixelValues[i] - n) < Math.abs(closest_n - n)){
								closest_n = snapPixelValues[i];
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
						if (isLocked && settings.startAt[0] !== settings.startAt[1]){
							// snap other, else snap current knob
							if (Math.abs(closest - m) > Math.abs(closest_n - n)){
								boolN = true;
								closest = closest_n;
								m = (target === knob1) ? n-knobWidthQuarter : n;//+knobWidthQuarter;
							} else {
								m = (target === knob2) ? m-knobWidthHalf : m;
							}
						} else if (!isLocked && target === knob2) m -= knobWidthHalf;	// knob2 adjust
					};

					if (kind == 'drag'){
						if (snapType == 'hard'){
							updateSnap(closest, knobWidth);
							doOnSnap(closest, pctVal, ((target === knob1) ? 'from' : 'to'));

						} else {
							lockedRangeAdjusts();

							if (Math.round(Math.abs(closest - m + knobWidthHalf/8)) < snapOffset){
								updateSnap(closest, knobWidth, false, boolN);
								doOnSnap(closest, pctVal, ((target === knob1) ? 'from' : 'to'));

							} else storedSnapValues = ['a-1', 'b-1'];
						}
					} else if (kind == 'hard'){
						lockedRangeAdjusts();
						updateSnap(closest, knobWidth, false, boolN);
						return closest;
					} else {
						lockedRangeAdjusts();
						updateSnap(closest, knobWidth, false, boolN);	// animation not supported
						return closest;
					}
				}
			}
		}, doOnSnap = function(a, b, which){ // callback: onSnap
			var storedSnapIndex = 0;
			var ab = null;

			if (which == 'to'){
				storedSnapIndex = 1;
				ab = 'b'+b;
			} else {
				ab = 'a'+a;
			}

			if (options.onSnap && ab !== storedSnapValues[storedSnapIndex]){
				storedSnapValues[storedSnapIndex] = ab;
				var snapObj = null;

				if (which == 'to')
					snapObj = updateME(getPercent([(storedSnapValues[0].indexOf('-1') !== -1) ? THE_VALUES[0] : storedSnapValues[0], b]));
				else
					snapObj = updateME(getPercent([b, (storedSnapValues[1].indexOf('-1') !== -1) ? THE_VALUES[1] : storedSnapValues[1]]));

				options.onSnap(snapObj);
			}
		}, updateSnap = function(closest, knobWidth, animateBln, isN){
			var getFollowPos = function(){
				return (closest+knobWidth/4+knobWidth/2);
			};
			
			followPos = getFollowPos();

			if ((target === knob1 && !isN) || (target === knob2 && isN)){
				// patch: contraint right: if new knob2 pos > end knob2 pos, set new closest value;
				if (isLocked && (closest+lockedDiff-knobWidth/2) > (self_width - knobWidth)){
					closest -= (closest+lockedDiff-knobWidth/2) - (self_width - knobWidth);
				}

				knob1.style.left	= closest+'px';
				follow1.style.width	= (closest+knobWidth/4)+'px';

				if (isLocked){
					knob2.style.left	= (closest+lockedDiff-knobWidth/2)+'px';
					follow2.style.width	= (closest+knobWidth/4+lockedDiff)+'px';
				}
			} else {
				// patch: constraint left: if new knob1 pos < 0, set new closest value;
				if (isLocked && (closest-lockedDiff+knobWidth/2) <= 0){
					closest -= closest-lockedDiff+knobWidth/2;
					followPos = getFollowPos();
				}

				knob2.style.left	= closest+'px';
				follow2.style.width	= followPos+'px';

				if (isLocked){
					knob1.style.left	= (closest-lockedDiff+knobWidth/2)+'px';
					follow1.style.width	= (followPos-lockedDiff)+'px';
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
		if (isMobile || uAgent.match(/Windows Phone/i)){
			// orientation
			window.addEventListener('orientationchange', eventWindowResize);
		}

		eventDocumentMouseMove = function(e){
			if (is_down){
				e = e || event;	// ie fix

				var x			= null,
					selfWidth	= self.offsetWidth,
					knobWidth	= knob1.offsetWidth;

				if (vert){
					// MS bug: manually set offsetTop, otherwise try to get the vertical wrapper's offsetTop
					if (window.navigator.msPointerEnabled && MSoffsetTop === null) MSoffsetTop = self.getBoundingClientRect().top;
					else if (vmarks !== null && MSoffsetTop === null) MSoffsetTop = vmarks.offsetTop;

					var base = (MSoffsetTop !== null ? MSoffsetTop : self.offsetTop) + selfWidth;
					if (isMobile){
						touchY = e.targetTouches[0].pageY;
						x = base - touchY;
					} else x = base - e.pageY;
				} else {
					if (isMobile){
						touchX = e.targetTouches[0].pageX;
						x = touchX - self.offsetLeft;
					} else x = e.pageX - self.offsetLeft;
				}

				var stopper = knobWidth / 2;
				var m = x - stopper;

				if (e.returnValue) e.returnValue = false;

				// constraint
				if (!isLocked){
					if (target === knob1){
						var knob2_style_left	= knob2.style.left;
						var knob2_offset_left	= knob2.offsetLeft;

						if (x <= stopper){
							target.style.left = '0';
							follow1.style.width = stopper+'px';
						} else if (x >= knob2_offset_left-stopper){
							target.style.left = knob2_style_left;
							follow1.style.width = (knob2_offset_left-stopper)+'px';
						} else {
							target.style.left = (x-stopper)+'px';
							follow1.style.width = x+'px';
							if (!snapType || snapType == 'hard') doSnap('drag', m);
						}
					} else if (target === knob2){
						var knob1_style_left	= knob1.style.left;
						var knob1_offset_left	= knob1.offsetLeft;

						if (x <= knob1_offset_left+stopper+knobWidth){
							target.style.left = knob1_style_left;
							follow2.style.width = (knob1_offset_left+stopper+knobWidth)+'px';
						} else if (x >= self_width-stopper){
							target.style.left = (self_width-knobWidth*2)+'px';
							follow2.style.width = (self_width-stopper)+'px';
						} else {
							target.style.left = (x-stopper-knobWidth)+'px';
							follow2.style.width = x+'px';
							if (!snapType || snapType == 'hard') doSnap('drag', m);
						}
					}
				} else {
					if (target === knob1){
						if (x <= stopper){
							target.style.left = '0';
							follow1.style.width = stopper+'px';

							knob2.style.left = (lockedDiff-knobWidth)+'px';
							follow2.style.width = (lockedDiff+stopper)+'px';
						} else if (x >= self_width-lockedDiff-stopper){
							knob2.style.left = (self_width-knobWidth*2)+'px';
							follow2.style.width = (self_width-stopper)+'px';

							target.style.left = (self_width-lockedDiff-knobWidth)+'px';
							follow1.style.width = (self_width-lockedDiff-stopper)+'px';
						} else {
							target.style.left = (x-stopper)+'px';
							follow1.style.width = x+'px';

							knob2.style.left = (x-stopper-knobWidth+lockedDiff)+'px';
							follow2.style.width = (x+lockedDiff)+'px';
							if (!snapType || snapType == 'hard') doSnap('drag', m);
						}
					} else if (target === knob2){
						if (x <= lockedDiff+stopper){
							target.style.left = (lockedDiff-knobWidth)+'px';
							follow2.style.width = (lockedDiff+stopper)+'px';

							knob1.style.left = '0';
							follow1.style.width = stopper+'px';
						} else if (x >= self_width-stopper){
							target.style.left = (self_width-knobWidth*2)+'px';
							follow2.style.width = (self_width-stopper)+'px';

							knob1.style.left = (self_width-lockedDiff-knobWidth)+'px';
							follow1.style.width = (self_width-lockedDiff-stopper)+'px';
						} else {
							target.style.left = (x-stopper-knobWidth)+'px';
							follow2.style.width = x+'px';

							knob1.style.left = (x-stopper-lockedDiff)+'px';
							follow1.style.width = (x-lockedDiff)+'px';
							if (!snapType || snapType == 'hard') doSnap('drag', m);
						}
					}
				}

				// results
				setResults();

				// update values
				if (options.drag && self.getAttribute('data-state') == 'active')
					options.drag(updateME(getPercent([result_from, result_to])));
			}
		};
		eventDocumentMouseUp = function(e){
			is_down = false;
			if (self.getAttribute('data-state') == 'active'){
				e = e || event;	// ie fix
				var x = null, base = 0, selfWidth = self.offsetWidth;

				if (vert){
					// base = self.offsetTop + selfWidth;
					base = (!window.navigator.msPointerEnabled ? self.offsetTop : self.getBoundingClientRect().top) + selfWidth;
					x = base - ((!isMobile ? e.pageY : touchY)-2);
				} else x = (!isMobile ? e.pageX : touchX) - self.offsetLeft;
				
				var knobWidth	= knob1.offsetWidth;
				var stopper		= knobWidth / 2;
				var m			= x - stopper;	// true position of knob

				// snap to
				if (snaps > 0 && snaps < 10 && (snapType == 'soft' || snapType == 'hard')){
					if (target === knob1 && m <= knob2.offsetLeft)
						result_from = doSnap((snapType == 'hard') ? 'hard' : 'soft', m);
					else if (target === knob2 && m >= knob1.offsetLeft)
						result_to = doSnap((snapType == 'hard') ? 'hard' : 'soft', m);
				}

				if (options.drop) options.drop(updateME(getPercent([result_from, result_to])));
				if (options.drag && self.getAttribute('data-state') == 'active') options.drag(updateME(getPercent([result_from, result_to])));
				self.setAttribute('data-state', 'inactive');
			}
		};

		eventWindowResize = function(){
			that.startAt(startAt);
			if (markers) drawSnapmarks(true);
		};

		document.addEventListener(mEvt.move, eventDocumentMouseMove);
		document.addEventListener(mEvt.up, eventDocumentMouseUp);
		window.addEventListener('resize', eventWindowResize);

		//------------------------------------------------------------------------------------------------------------------------------------
		// functions

		var setResults = function(){
			result_from	= knob1.style.left || '0';
			result_from	= result_from.replace('px', '');
			result_to	= knob2.style.left || '0';
			result_to	= result_to.replace('px', '');
		};

		// set locked positions
		if (isLocked){
			var lockedKnob1Pos	= null,
				lockedKnob2Pos	= null,
				lockedDiff		= null,
				getLockedPositions = function(){
				lockedKnob1Pos	= parseFloat(knob1.style.left.replace('px', ''), 10);// + knob_width_css;
				lockedKnob2Pos	= parseFloat(knob2.style.left.replace('px', ''), 10) + knob1.offsetWidth;
				lockedDiff		= lockedKnob2Pos - lockedKnob1Pos;
			};
		}

		if (customRange){
			var cstmStart = settings.totalRange[0];
			var diff = settings.totalRange[1] - cstmStart;
		}
		var sendData = {};
		var getPercent = function(arr){
			var o = null, pcts = [], cstm = [], p = 0;

			for (var i = 0; i < arr.length; i++){
				o = parseFloat(arr[i], 10);
				// calculate percentage
				p = o / (self_width - (knob1.offsetWidth * 2)) * 100;
				pcts.push(p);
				if (customRange) cstm.push(diff * p / 100 + cstmStart);
			}

			// set data to send
			sendData.percentRange = pcts;
			if (customRange) sendData.customRange = cstm;

			THE_VALUES = pcts;
			return sendData;
		};

		var updateME = function(o){
			o.id = guid;
			o.el = self;
			return o;
		};

		//------------------------------------------------------------------------------------------------------------------------------------
		// start

		var setStartAt = function(){
			var num = startAt;

			that.startAt(num);
			setResults();

			var rlt = updateME(getPercent([result_from, result_to]));

			// inits
			if (snaps > 0 && snaps < 10)	drawSnapmarks();
			if (vert)						verticalTransform();
			if (options.onload)				options.onload(rlt);
			if (isLocked)					getLockedPositions();

			window.removeEventListener('makeready.'+guid, setStartAt);
		};

		//Listen to your custom event
		var eventMakeReady = new CustomEvent('makeready.'+guid);
		window.addEventListener('makeready.'+guid, setStartAt);
	})(document, this, get);
}