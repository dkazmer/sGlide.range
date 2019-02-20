/*global window:false, console:false, document:false, event:false, jQuery:false */

/***********************************************************************************

author:		Daniel B. Kazmer (webshifted.com)
created:	11.11.2014
version:	2.0.0

	version history:
		2.0.0	retina setting default set to false, better code for retina display handling in general; minor refactoring; fixed soft-snap registration issue on bar-drag; fixed issue with handle-drag in vert-marks [correct container to offset]; better retina img processing;
				equalized snap point flank distance; added handleSize prop; restored snapping other knob on knob-drag when locked; removed barriers to using same startAt values (17.01.2019)
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
		const guid = self.getAttribute('id');

		// unwrap vertical buttons
		const vertContainer = $('#'+guid+'_vert-marks');
		if (vertContainer){
			const vertParent = vertContainer.parentNode;
			vertParent.insertBefore(self, vertContainer.nextSibling);
			vertParent.removeChild(vertContainer);
		}

		const markers = $('#'+guid+'_markers');
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

		for (let i in this) delete this[i];
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

		const selfWidth	= self.offsetWidth,
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
	const notifier = fn => callback = fn;
	this.load = notifier;

	//------------------------------------------------------------------------------------------------------------------------------------
	// private global functions

	const loadKnobImgs = (paths, cb) => {
		var imgArray	= paths || [];
		var promises	= [];

		if (!imgArray.length) return;

		imgArray.forEach((item, i) => {
			promises.push(new Promise(resolve => {
				const img = new Image();
				img.onload = () => {
					cb(img, i);
					resolve();
				};
				img.src = item;
			}));
		});

		return Promise.all(promises);
	};

	// may not play nice with jQ
	const $ = (name, c) => !c ? document.querySelectorAll(name) : c.querySelectorAll(name);

	const wrapAll = (elements, wrapperStr) => {
		// set wrapper element
		const a = document.createElement('div');
		a.innerHTML = wrapperStr;
		const wrapperEl = a.childNodes[0];
		elements[0].parentNode.insertBefore(wrapperEl, elements[0]);

		// append it
		for (let el of elements) wrapperEl.appendChild(el);
	};

	const clone = obj => {
		if (obj === null || typeof(obj) != 'object') return obj;

		const temp = obj.constructor(); // changed

		for (let key in obj){
			if (obj.hasOwnProperty(key)){
				temp[key] = clone(obj[key]);
			}
		}

		return temp;
	};

	// from https://gist.github.com/pbojinov/8f3765b672efec122f66
	// Stay with "function", uses "arguments.callee(...)"
	function extend(destination, source){
		for (let property in source){
			if (source[property] && source[property].constructor && source[property].constructor === Object){
				destination[property] = destination[property] || {};
				arguments.callee(destination[property], source[property]);
			} else {
				destination[property] = source[property];
			}
		}
		return destination;
	}

	const css = (el, styles, prefixes) => {
		let cssString = '';

		if (prefixes){
			let temp = {};
			for (let key in styles){
				if (styles.hasOwnProperty(key)){
					for (let prefix of prefixes){
						temp[prefix+key] = styles[key];
					}
				}
			}
			styles = temp;
		}

		for (let key in styles){
			let s = styles[key];
			if (styles.hasOwnProperty(key)){
				// cssString += key + ':' + styles[key] + ';';
				cssString += key + ':' + (typeof s === 'number' ? s + 'px' : s) + ';';
			}
		}

		el.style.cssText += ';' + cssString;
		return el;
	};

	((document, that) => {
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
			'noHandle'		: false,
			'handleSize'	: null
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

		const handleSize = () => {
			switch (settings.handleSize) {
				case 'big': return '4%';
				case 'small': return '1%';
				default: return '2%';
			}
		};

		// local variables
		var THE_VALUES		= startAt = settings.startAt,
			self_height		= Math.round(settings.height)+'px',
			MSoffsetTop		= null,
			vmarks			= null,
			result_from		= 0,
			result_to		= 0,
			knob_bg			= '#333',
			knob_width_css	= (settings.noHandle ? '0' : handleSize()),
			knob_height_css	= 'inherit',
			isLocked		= settings.locked;

		const	vert		= settings.vertical,
			is_snap			= (settings.snap.points > 1 && settings.snap.points <= 11),
			markers			= (is_snap && settings.snap.marks),
			snapType		= (settings.snap.type != 'hard' && settings.snap.type != 'soft') ? false : settings.snap.type,
			r_corners		= settings.pill,
			imageBln		= (settings.image != 'none' && settings.image !== '' && !settings.noHandle),
			retina			= (window.devicePixelRatio > 1) && settings.retina,
			customRange		= (settings.totalRange[0] !== 0 || settings.totalRange[1] !== 0) && settings.totalRange[0] < settings.totalRange[1];

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
			img = (img instanceof Array) ? img : [img, img];

			// retina
			if (retina){
				const processRetinaImage = fileName => {
					const ix = fileName.lastIndexOf('.');
					return fileName.slice(0, ix) + '@2x' + fileName.slice(ix);
				};

				for (let i = 0; i < img.length; i++){
					img[i] = processRetinaImage(img[i]);
				}
			}

			const imageLoaded = (image, i) => {
				let newImage = image;
				let el = knobs[i];
				let path = img[i];
				// let multiImageIndex = 0;
				let thisHeight = newImage.naturalHeight;

				if (retina){
					knob_width_css	= newImage.naturalWidth/2+'px';
					knob_height_css	= thisHeight/2+'px';
				} else {
					knob_width_css	= newImage.naturalWidth+'px';
					knob_height_css	= thisHeight+'px';
				}

				knob_bg = 'url('+path+') no-repeat';

				// apply knob image styles
				el.style.width		= knob_width_css;
				el.style.height		= knob_height_css;
				el.style.background	= knob_bg;
				if (retina) el.style.backgroundSize = '100%';

				css(follows[i], {
					'height': knob_height_css,
					'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0'
				});

				if (i === 0){
					css(self, {
						'height': knob_height_css,
						'border-radius': r_corners ? thisHeight / 2 + 'px' : '0'
					});
				}

				{
					let settings_height = settings.height;
					if (thisHeight > settings_height){
						let knobMarginValue = (thisHeight-settings_height)/2;
						if (retina) knobMarginValue = (thisHeight/2-settings_height)/2;

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
				}
			};

			loadKnobImgs(img, imageLoaded).then(() => window.dispatchEvent(eventMakeReady));
		} else {
			var d = settings.height / 2;
			css(self, {'border-radius': (r_corners ? d+'px' : '0'), 'overflow': 'hidden'});
			for (var i = 0; i < knobs.length; i++)
				css(follows[i], {'border-radius': (r_corners ? d+'px 0 0 '+d+'px' : '0')});

			setTimeout(() => {
				// for (var i = 0; i < knobs.length; i++)
				// 	knobs[i].style.backgroundColor = knob_bg;	// IE patch
				for (let k of knobs) k.style.backgroundColor = knob_bg;	// IE patch

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

		for (let ia = 0; ia < knobs.length; ia++){
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

		const preSnap = () => {
			// snap to nearest point on hard or snapOffset
			var was_locked = isLocked;
			if (was_locked) isLocked = false;

			if (snapType === 'hard'){
				target = knob1;
				snapDragon(knob1.offsetLeft);
				target = knob2;
				snapDragon(knob2.offsetLeft);
			} else if (snapType === 'soft'){
				const snapKnobs = el => {
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

		const setPixelValues = (sw, kw) => {
			snapPxlValues = [0];
			const increment = sw / (snaps - 1);
			var step = increment;

			while (step <= sw+kw){
				snapPxlValues.push(step);
				step += increment;
			}
		};

		const setSnapValues = () => {
			// if (snaps === 1) snaps = 2;

			// pixel
			var kw = Math.round((knob1.offsetWidth + knob2.offsetWidth) / 2);
			var sw = Math.round(self_width - kw * 2);
			// snapPxlValues[0] += kw;

			setPixelValues(sw, kw);

			// percentage
			for (let px of snapPxlValues) snapPctValues.push(px / sw * 100);

			snapPctValues[snapPctValues.length-1] = 100;

			if (markers) drawSnapmarks();
		};

		const drawSnapmarks = () => {
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
				let str = '';
				let val = null;

				// for (let i = 0; i < snapValues.length; i++){
				for (let i = snaps - 1; i >= 0; i--){
					val = (self_width - kw_*2) / (snaps-1) * i + kw_;
					// str += '<div style="display:inline-block; width:0; height:5px; border-left:#333 solid 1px; position:relative; left:'+val+'px; float:left"></div>';
					str += '<div style="width:0; height:5px; border-left:#333 solid 1px; position:absolute; left:'+val+'px"></div>';
				}

				marks.innerHTML = str;
			}
		};

		// -----------

		// vertical
		const verticalTransform = () => {
			const vertWidth = Math.round(self.offsetWidth / 2);
			const vertHeight = Math.round(self.offsetHeight / 2);

			cssRotate.transform += ' translate(-'+Math.abs(vertWidth - vertHeight)+'px, 0)';

			if (markers && is_snap){
				const a = [self, $('#'+guid+'_markers')[0]];

				wrapAll(a, '<div id="'+guid+'_vert-marks" style="margin:0; z-index:997; width:'+width+unit+
					'; -webkit-backface-visibility:hidden; -moz-backface-visibility:hidden; -ms-backface-visibility:hidden; backface-visibility:hidden; display:inline-block"></div>');

				vmarks = $('#'+guid+'_vert-marks')[0];

				css(self, {'width': '100%'});
				css(vmarks, clone(cssContentBox), cssPrefixes);
				css(vmarks, clone(cssRotate), cssPrefixes);
				css(vmarks, {'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'});
				css(vmarks, {'transform-origin': vertWidth+'px '+vertHeight+'px'}, cssPrefixes);

				for (let b of a) css(b, {'margin': '0'});
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
		// var is_same = false;
		// var storedBarSnapValue = null;
		var is_onSnapPoint = false;
		var was_onSnapPoint_left = true;
		var was_onSnapPoint_right = true;
		var simulSnap = false;
		var moved = false;

		// get closest snap mark (px)
		const getClosest = x => {
			var c = 0, kw = (snapType === 'hard') ? knob1.offsetWidth/2 : 0;
			for (let val of snapPxlValues){
				if (Math.abs(val - x + kw) < Math.abs(c - x + kw)) c = val;
			}
			return c;
		};

		const thisKnobPos = (x, w) => (target === knob2) ? x - w * 0.875 : x + w / 8;
		// const thisKnobPos = (x, w) => (target === knob2) ? x - w * 0.875 : x + (w - w * 0.875);

		const doSnap = (kind, m) => {
			if (is_snap){
				const sense = settings.snap.sensitivity;

				// although snap is enabled, sensitivity may be set to nill, in which case marks are drawn but won't snap to
				if (sense || snapType === 'hard' || snapType === 'soft'){
					const knobWidthHalf		= target.offsetWidth,
						knobWidth			= knobWidthHalf * 2,
						snapOffset			= (sense && sense > 0 && sense < 4 ? (sense + 1) * 5 : 15) - 3;

					var closest = getClosest(m);

					// if locked, get closest mark for other knob
					// for true snap only (when not both knobs are on snap points)
					// if (/*isLocked || */(barDrag || barDrag_drop) && !snapType){
					if ((isLocked || barDrag || barDrag_drop) && !snapType){
						var n = (target === knob1) ? (m + lockedDiff - target.offsetWidth) : (m - lockedDiff);
						var closest_n = getClosest(n);
					}

					// ----------------------------------------------------
					// physically snap it

					let boolN = false;

					const lockedRangeAdjusts = () => {
						// first compare which is closer: m or n
						// if n, m = n, closest = closest_n
						// if locked & startAts different
						// if ((isLocked || barDrag) && settings.startAt[0] !== settings.startAt[1]){
						if (isLocked || barDrag){
						// if (barDrag && settings.startAt[0] !== settings.startAt[1]){
							let thisKnobToClosest = Math.abs(closest - m + knobWidthHalf);
							let thatKnobToClosest = Math.abs(closest_n - n);

							simulSnap = Math.abs(thisKnobToClosest - thatKnobToClosest) < 1 && is_onSnapPoint;
							// snap other, else snap current knob
							if (thisKnobToClosest > thatKnobToClosest){
								// that knob
								boolN = true;
								closest = closest_n;
								m = n + knobWidthHalf / 8;
								// m = n + (knobWidthHalf - knobWidthHalf * 0.875);
							} else m = thisKnobPos(m, knobWidthHalf);
						} else m = thisKnobPos(m, knobWidthHalf);
					};

					if (kind === 'drag'){
						if (snapType === 'hard'){

							if (barDrag){
								// if (Math.abs(closest_n - knob1.offsetLeft) < Math.abs(closest - knob2.offsetLeft + knobWidthHalf)){
								if (Math.abs(closest_n - knob1.dataObj.px) < Math.abs(closest - knob2.dataObj.px)){
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
								// on snap point
								is_onSnapPoint = true;
								snapUpdate(closest, knobWidth, boolN);
							} else {
								// off snap point
								is_onSnapPoint = false;
								if (target === knob1 || barDrag && boolN) was_onSnapPoint_left = true;
								else if (target === knob2) was_onSnapPoint_right = true;
							}
						}
					} else {
						if (!barDrag) lockedRangeAdjusts();

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
									snapUpdate(closest, knobWidth, null);
									was_onSnapPoint_left = true;
								} else {
									was_onSnapPoint_left = true;
									snapUpdate(closest, knobWidth);
									was_onSnapPoint_right = true;
								}
								moved = false;
								return closest;
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
		}, snapOutput = (which, closest) => { // callback: onSnap
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

		}, snapUpdate = (closest, knobWidth, isN) => {
			// const getFollowPos = () => (closest+knobWidth/4+knobWidth/2);
			const getFollowPos = () => (closest+knobWidth*0.75);

			var followPos = getFollowPos();

			// -----------------------------

			if ((target === knob1 && !isN) || (target === knob2 && isN)){
				const diff = () => closest+lockedDiff-knobWidth/2;

				// patch: constraint right: if new knob2 pos > end knob2 pos, set new closest value;
				if ((isLocked || barDrag || barDrag_drop) && diff() > (self_width - knobWidth))
					closest -= diff() - (self_width - knobWidth);

				// true snap, when this knob is too close to snap point, but closer to that knob
				else if (closest > knob2.dataObj.px && !snapType)
					closest = knob2.dataObj.px;


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
				const diff = () => closest-lockedDiff+knobWidth/2;

				// patch: constraint left: if new knob1 pos < 0, set new closest value;
				if ((isLocked || barDrag || barDrag_drop) && (closest-lockedDiff+knobWidth/2) <= 0)
					closest -= diff();

				// true snap, when this knob is too close to snap point, but closer to that knob
				else if (closest < knob1.dataObj.px && !snapType)
					closest = knob1.dataObj.px;


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
			eventDocumentMouseDown = e => {
				// is_down = false;
				touchX = e.targetTouches[0].pageX;
				touchY = e.targetTouches[0].pageY;
			};
			document.addEventListener(mEvt.down, eventDocumentMouseDown);
		}

		var z = null;
		var a = false, b = false; // used to mitigate constraint checkers
		var barDrag_drop = false;

		eventDocumentMouseMove = e => {
			if (is_down){
				e = e || event;	// ie fix
				moved = true;

				var x			= null,
					knobWidth	= (knob1.offsetWidth + knob2.offsetWidth) / 2;

				if (vert){
					// var base = self.offsetTop + self_width;
					// var base = self.parentNode.offsetTop + self_width;
					let base = (markers ? vmarks.offsetTop : self.offsetTop) + self_width;
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

				const stopper = knobWidth / 2;
				const m = x - stopper;

				if (e.returnValue) e.returnValue = false;

				if (!isLocked && !barDrag){
					if (target === knob1){
						const knob2_style_left	= knob2.data('px');
						const knob2_offset_left	= knob2.offsetLeft;
						// const knob2_offset_left	= knob2_style_left;

						// if (x <= stopper && (!is_snap || snapType !== 'hard')){
						// if (x <= stopper || (is_snap && snapType === 'hard')){
						if (x <= stopper){
							if (b) b = false;
							if (!a){
								css(knob1, {'left': 0}).data('px', 0);
								css(follow1, {'width': stopper});
								a = true;
							}
						// } else if (x >= knob2_offset_left-stopper && (!is_snap || snapType !== 'hard')){
						// } else if (x >= knob2_offset_left-stopper || (is_snap && snapType === 'hard')){
						} else if (x >= knob2_offset_left-stopper){ // should use this, but throws error
							if (a) a = false;
							if (is_snap && snapType === 'hard') return a;
							if (!b){
								css(knob1, {'left': knob2_style_left}).data('px', knob2_style_left);
								css(follow1, {'width': (knob2_offset_left-stopper)});
								if (snapType === 'hard') snapOutput(getPercent([result_from, result_to]).percentRange[1], 'from');
								b = true;
							}
						} else {
							a = b = false;
							css(knob1, {'left': m}).data('px', m);
							css(follow1, {'width': x});
							snapDragon(m);
						}
					} else if (target === knob2){
						const knob1_style_left	= knob1.data('px');
						const knob1_offset_left	= knob1.offsetLeft;
						// const knob1_offset_left	= knob1_style_left;

						// if (x <= knob1_offset_left+stopper+knobWidth && (!is_snap || snapType !== 'hard')){
						// if (x <= knob1_offset_left+stopper+knobWidth || (is_snap && snapType === 'hard')){
						if (x <= knob1_offset_left+stopper+knobWidth){
							if (b) b = false;
							if (is_snap && snapType === 'hard') return b;
							// return b;
							if (!a){
								css(knob2, {'left': knob1_style_left}).data('px', knob1_style_left);
								css(follow2, {'width': (knob1_offset_left+stopper+knobWidth)});
								if (snapType === 'hard') snapOutput(getPercent([result_from, result_to]).percentRange[0], 'to');
								a = true;
							}
						// } else if (x >= self_width-stopper && (!is_snap || snapType !== 'hard')){
						// } else if (x >= self_width-stopper || (is_snap && snapType === 'hard')){
						} else if (x >= self_width-stopper){
							if (a) a = false;
							if (!b){
								css(knob2, {'left': (self_width-knobWidth*2)}).data('px', (self_width-knobWidth*2));
								css(follow2, {'width': (self_width-stopper)});
								b = true;
							}
						} else {
							a = b = false;
							css(knob2, {'left': (m-knobWidth)}).data('px', (m-knobWidth));
							css(follow2, {'width': x});
							snapDragon(m);
						}
					}
				} else {
					if (target === knob1){
						// if (x <= stopper && (!is_snap || snapType !== 'hard')){ // avoids snapping twice due to contraint?
						// if (x <= stopper || (is_snap && snapType === 'hard')){
						if (x <= stopper){
							if (b) b = false;
							if (!a){
								css(knob1, {'left': 0}).data('px', 0);
								css(follow1, {'width': stopper});

								css(knob2, {'left': (lockedDiff-knobWidth)}).data('px', (lockedDiff-knobWidth));
								css(follow2, {'width': (lockedDiff+stopper)});
								a = true;
							}
						// } else if (x >= self_width-lockedDiff-stopper && (!is_snap || snapType !== 'hard')){
						// } else if (x >= self_width-lockedDiff-stopper || (is_snap && snapType === 'hard')){
						} else if (x >= self_width-lockedDiff-stopper){
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
							css(knob1, {'left': m}).data('px', m);
							css(follow1, {'width': x});

							css(knob2, {'left': (m-knobWidth+lockedDiff)}).data('px', (m-knobWidth+lockedDiff));
							css(follow2, {'width': (x+lockedDiff)});
							snapDragon(m);
						}
					} else if (target === knob2){
						// if (x <= lockedDiff+stopper && (!is_snap || snapType !== 'hard')){
						// if (x <= lockedDiff+stopper || (is_snap && snapType === 'hard')){
						if (x <= lockedDiff+stopper){
							if (b) b = false;
							if (!a){
								css(knob2, {'left': (lockedDiff-knobWidth)}).data('px', (lockedDiff-knobWidth));
								css(follow2, {'width': (lockedDiff+stopper)});

								css(knob1, {'left': 0}).data('px', 0);
								css(follow1, {'width': stopper});
								a = true;
							}
						// } else if (x >= self_width-stopper && (!is_snap || snapType !== 'hard')){
						// } else if (x >= self_width-stopper || (is_snap && snapType === 'hard')){
						} else if (x >= self_width-stopper){
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
							css(knob2, {'left': (m-knobWidth)}).data('px', (m-knobWidth));
							css(follow2, {'width': x});

							css(knob1, {'left': (m-lockedDiff)}).data('px', (m-lockedDiff));
							css(follow1, {'width': (x-lockedDiff)});
							snapDragon(m);
						}
					}
				}

				// results
				setResults();

				// update values
				if (options.drag && self.data('state') === 'active'){
					const value = updateME.apply(that, getPercent(result_from, result_to));
					THE_VALUES = value.percentRange;
					options.drag.call(self, value);
				}
			}
		};

		eventDocumentMouseUp = e => {
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
						base = (markers ? vmarks.offsetTop : self.offsetTop) + self_width;
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
					if (barDrag_drop && snapType === 'soft'){
						doSnap('soft', m); // send m, not x
					} else {
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

		eventWindowResize = () => {
			if (!vert){
				self_width = Math.round(self.offsetWidth);

				var val = null;
				var kw1	= knob1.offsetWidth;
				/*var pos	= (arr => {
					for (let v of THE_VALUES) arr.push(v / 100 * (self_width - kw1) + (kw1/2));
					return arr;
				})([]);*/

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

		eventKnobMouseDown = e => {
			target = e.target;
			is_down = true;
			self.data('state', 'active');
		};

		eventKnobMouseUp = () => is_down = false;

		// on drag-snap
		const snapDragon = m => {
			if (is_snap && !snapType || snapType === 'hard') doSnap('drag', m);
		};

		const initEventHandlers = () => {
			// init touch event handlers
			if (isMobile && !settings.disabled){
				document.addEventListener(mEvt.down, e => {
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

				follow2.addEventListener(mEvt.down, () => {
					is_down = barDrag = true;
					target = knob2;
					self.data('state', 'active');
				});
				follow2.addEventListener(mEvt.up, () => is_down = false);
			}

			window.addEventListener('resize', eventWindowResize);
		};

		//------------------------------------------------------------------------------------------------------------------------------------
		// functions

		const setResults = () => {
			result_from	= knob1.data('px') || knob1.offsetLeft || 0;
			result_to	= knob2.data('px') || (knob2.offsetLeft - knob2.offsetWidth) || 0;
		};

		// set locked positions
		var lockedKnob1Pos		= null,
			lockedKnob2Pos		= null,
			lockedDiff			= null,
			gotLockedPositions	= false;
		
		const getLockedPositions = () => {
			lockedKnob1Pos	= knob1.data('px') || knob1.offsetLeft;
			lockedKnob2Pos	= knob2.data('px') || knob2.offsetLeft;
			lockedDiff		= lockedKnob2Pos - lockedKnob1Pos + knob2.offsetWidth;
			gotLockedPositions = true;
		};

		if (customRange){
			var cstmStart = settings.totalRange[0];
			var diff = settings.totalRange[1] - cstmStart;
		}
		
		const getPercent = (a, b) => {
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

		const updateME = (_from, _to) => {
			// set data to send
			var sendData = {'percentRange': [_from, _to]};

			// calculate unit
			if (customRange){
				const toCustom = pct => (diff * pct / 100 + cstmStart);
				sendData.customRange = [toCustom(_from), toCustom(_to)];
			}

			return sendData;
		};

		//------------------------------------------------------------------------------------------------------------------------------------
		// start

		const setStartAt = () => {
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