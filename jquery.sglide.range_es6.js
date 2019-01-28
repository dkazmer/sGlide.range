/*global window:false, console:false, document:false, event:false, jQuery:false */

/***********************************************************************************

author:		Daniel B. Kazmer (webshifted.com)
created:	1.11.2014
version:	2.0.0

	version history:
		2.0.0	retina setting default set to false ... improved vertical positioning and alignments; unit default set to null; fixed soft-snap registration issue on bar-drag; fixed issue with handle-drag in vert-marks [correct container to offset]; better retina img processing; added deep-extend to settings to properly support snap sub-object (24.01.2019)
		1.3.0	added snap sensitivity - accepts decimal values between 0 & 3 inclusive; added bar-drag; bug fix: set to correct values at onSnap asynchronously; cleaner: relying on offset values instead of style (type String); slight performance improvement with constraint checker mitigation; improved hard snap, esp. when startAt values are not at markers; better destroy method (06.04.2017)
		1.0.1	bug fix: text inputs were not selectable by mouse-drag in Chrome for jQuery - a proper if statement in the document's mousemove event listener solved it, thereby possibly increasing performance (applied to both jQuery and standalone) (01.02.2015)
		1.0.0	created - born of sGlide

	usage:
		apply the following to an empty DIV with a unique id

		$('#slider').sGlideRange({
			startAt: 60,			// start slider knob at - default: 0
			image: ''				// string or array - image path(s)
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
			drop/drag/onSnap: o => {
				console.log('returned object',o);
			}
		});

		All properties are optional. To retrieve data, use one of the callbacks

	goals:
		- test: positions of locked handles when startAt point specified
		- if unit is %, then markers should be also
		- fix bug: rebuilding vertical rotates again (is this fixed already?)

***********************************************************************************/

($ => {
	var valueObj	= {};
	var isMobile	= false;
	var methods		= {
		destroy: function(){
			this.each((i, el) => {
				const self	= $(el);
				const id	= self.selector;
				const guid	= self.attr('id');

				// unwrap vertical
				const vertContainer = $('#'+guid+'_vert-marks');
				if (vertContainer[0]) self.unwrap();

				setTimeout(() => {
					const markers = $('#'+guid+'_markers');
					if (markers.length > 0) markers.remove();
				}, 0);

				const mEvt = {
					'down'	: 'mousedown',
					'up'	: 'mouseup',
					'move'	: 'mousemove'
				};

				if (isMobile){
					mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
				} else
					$(document).off('keydown.'+guid).off('keyup.'+guid);

				$(document).off(mEvt.move+'.'+guid).off(mEvt.up+'.'+guid);
				self.off(mEvt.down);
				self.children('.slider_knob').off(mEvt.up).off(mEvt.down).remove();
				self.children('.follow_bar').off(mEvt.down).remove();
				self.removeAttr('style').removeClass('vertical');
			});
			return this;
		},
		startAt: function(pct){
			this.each((index, el) => {
				const self		= $(el);
				const knobs		= self.children('.slider_knob'),
					knob1		= self.children('.s_knob1'),
					knob2		= self.children('.s_knob2'),
					follows		= self.children('.follow_bar'),
					follow1		= self.children('.follow1'),
					follow2		= self.children('.follow2'),
					guid		= self.attr('id');

				valueObj[guid] = pct;

				// set pixel positions
				const selfWidth	= Math.round(self.width()),
					knobWidth	= knob1.width() * 2,
					px			= [],
					pxAdjust	= [];

				// constraints
				for (let i = 0; i < pct.length; i++){
					if (i === 2) break;

					if (pct[i] <= 0)		pct[i] = 0;
					else if (pct[i] >= 100)	pct[i] = 100;

					// set pixel positions
					px.push((selfWidth - knobWidth) * pct[i] / 100 + (knobWidth / 2));
					pxAdjust.push(px[i] - knobWidth / 2);
				}

				// gui
				knob1.css('left', pxAdjust[0]).data('px', pxAdjust[0]);
				knob2.css('left', pxAdjust[1]).data('px', pxAdjust[1]);
				follow1.css('width', (px[0]-knobWidth/4));
				follow2.css('width', (px[1]+knobWidth/4));
			});
			return this;
		},
		init: function(options){
			this.each((i, el) => {

				//------------------------------------------------------------------------------------------------------------------------------------
				// build skeleton

				var self	= $(el);
				var guid	= self.attr('id');

				// no id? give one!
				if (!guid){
					guid = 'sglide-range-'+i;
					self.attr('id', guid);
				}

				// add assets
				self.html('<div class="follow_bar follow1"></div><div class="follow_bar follow2"></div><div class="slider_knob s_knob1"></div><div class="slider_knob s_knob2"></div>');

				var knobs	= self.children('.slider_knob');
				var knob1	= self.children('.s_knob1');
				var knob2	= self.children('.s_knob2');
				var follows	= self.children('.follow_bar');
				var follow1	= self.children('.follow1');
				var follow2	= self.children('.follow2');

				//------------------------------------------------------------------------------------------------------------------------------------
				// settings & variables

				var settings = $.extend(true, {
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

				self.removeAttr('style');	// remove user inline styles

				const mEvt		= {
						'down'	: 'mousedown',
						'up'	: 'mouseup',
						'move'	: 'mousemove'
					},
					uAgent		= navigator.userAgent;

				if (uAgent.match(/Android/i) ||
					uAgent.match(/webOS/i) ||
					uAgent.match(/iPhone/i) ||
					uAgent.match(/iPad/i) ||
					uAgent.match(/iPod/i) ||
					// uAgent.match(/Windows Phone/i) ||
					uAgent.match(/BlackBerry/i)){
					isMobile = true;
					mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
					if (window.navigator.msPointerEnabled){
						mEvt.down = 'MSPointerDown'; mEvt.up = 'MSPointerUp'; mEvt.move = 'MSPointerMove';
					}
					var touchX = null, touchY = null;
				} else if (uAgent.match(/Windows Phone/i)){
					if (window.navigator.msPointerEnabled){
						self.css({'-ms-touch-action': 'none'});
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

				const handleSize = () => {
					if (settings.handleSize === 'big')
						return '4%';
					else if (settings.handleSize === 'small')
						return '1%';
					return '2%';
				}

				// variables
				valueObj[guid]		= settings.startAt;
				var result_from		= 0,
					result_to		= 0,
					vmarks			= null,
					knob_bg			= '#333',
					knob_width_css	= (settings.noHandle ? '0' : handleSize()),
					knob_height_css	= 'inherit';

				const vert			= settings.vertical,
					is_snap			= (settings.snap.points > 0 && settings.snap.points <= 11),
					markers			= (is_snap && settings.snap.marks),
					snapType		= (settings.snap.type != 'hard' && settings.snap.type != 'soft') ? false : settings.snap.type,
					r_corners		= settings.pill,
					imageBln		= (settings.image != 'none' && settings.image !== '' && !settings.noHandle),
					retina			= (window.devicePixelRatio > 1) && settings.retina,
					customRange		= (settings.totalRange[0] !== 0 || settings.totalRange[1] !== 0) && settings.totalRange[0] < settings.totalRange[1],
					isLocked		= settings.locked;

				//------------------------------------------------------------------------------------------------------------------------------------
				// image handling

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

				if (imageBln){	// if image
					let img = settings.image;

					// string or array
					img = (img instanceof Array) ? img : [img, img];

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

						/*if (retina){
							newImage.style.width	= (newImage.naturalWidth/2)+'px';
							thisHeight				= newImage.offsetHeight;
							knob_width_css			= newImage.offsetWidth+'px';
							knob_height_css			= thisHeight+'px';
						} else {
							knob_width_css			= newImage.naturalWidth+'px';
							knob_height_css			= thisHeight+'px';
						}*/

						knob_bg = 'url('+path+') no-repeat';

						// apply knob image styles
						el.style.width		= knob_width_css;
						el.style.height		= knob_height_css;
						el.style.background	= knob_bg;
						if (retina) el.style.backgroundSize = '100%';

						follows.eq(i).css({
							'height': knob_height_css,
							'border-radius': (r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0')
						});

						if (i === 0){
							self.css({
								'height': knob_height_css,
								'border-radius': (r_corners ? thisHeight / 2 : '0')
							});
						}

						{
							let settings_height = settings.height;
							if (thisHeight > settings_height){
								// var knobMarginValue = (thisHeight-settings_height)/2;
								let knobMarginValue = (thisHeight-settings_height)/2;
								if (retina) knobMarginValue = (thisHeight/2-settings_height)/2;
								
								self.css('height', settings_height+'px');

								for (ib = 0; ib < knobs.length; ib++){
									knobs[ib].style.top				= '-'+knobMarginValue+'px';
									follows[ib].style.height		= settings_height+'px';
									follows[ib].style.borderRadius	= r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0';
								}
							} else {
								// children stay inside parent
								self.css('overflow', 'hidden');
							}
						}
					};

					loadKnobImgs(img, imageLoaded).then(() => $(el).trigger(eventMakeReady));
				} else {
					let d = settings.height / 2;
					self.css({'border-radius': (r_corners ? d+'px' : '0'), 'overflow': 'hidden'});
					follows.css('border-radius', (r_corners ? d+'px 0 0 '+d+'px' : '0'));

					setTimeout(() => {
						$(el).trigger(eventMakeReady);
					}, 0);
				}

				//------------------------------------------------------------------------------------------------------------------------------------
				// styles

				// validate some user settings
				let width = settings.width;
				const unit = (!settings.unit && !vert) ? '%' : 'px';

				if (unit === 'px') width = Math.round(width);
				else if (unit === '%' && Math.round(width) > 100) width = 100;

				self.css({
					'width': width + unit,
					'height': settings.height+'px',
					'text-align': 'left',
					'margin': 'auto',
					'z-index': '997',
					'position': 'relative',
					'-webkit-touch-callout': 'none'
				});

				var self_width			= Math.round(self.width());
				var self_width_round	= Math.round(self_width / 2); 	// float value will blur vertical
				var self_height			= Math.round(self.height());
				var self_height_round	= Math.round(self_height / 2); 	// float value will blur vertical
				var translate			= ' translate(-'+Math.abs(self_width_round - self_height_round)+'px, 0)';

				const cssContentBox = {
					'-webkit-box-sizing': 'content-box',
					'-khtml-box-sizing': 'content-box',
					'-moz-box-sizing': 'content-box',
					'-ms-box-sizing': 'content-box',
					'box-sizing': 'content-box'
				}, cssUserSelect = {
					'-webkit-user-select': 'none',
					'-khtml-user-select': 'none',
					'-moz-user-select': 'none',
					'-ms-user-select': 'none',
					'user-select': 'none'
				}, cssRotate = {
					'-webkit-transform': 'rotate(-90deg)'+translate,
					'-khtml-transform': 'rotate(-90deg)'+translate,
					'-moz-transform': 'rotate(-90deg)'+translate,
					'-ms-transform': 'rotate(-90deg)'+translate,
					'transform': 'rotate(-90deg)'+translate,
					'-webkit-transform-origin': self_width_round+'px '+self_height_round+'px',
					'-khtml-transform-origin': self_width_round+'px '+self_height_round+'px',
					'-moz-transform-origin': self_width_round+'px '+self_height_round+'px',
					'-ms-transform-origin': self_width_round+'px '+self_height_round+'px',
					'transform-origin': self_width_round+'px '+self_height_round+'px',
					'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'
				};

				self.css(cssContentBox).css(cssUserSelect);

				knobs.css({
					'width': knob_width_css,
					'background': knob_bg,
					'height': knob_height_css,
					// 'display': (!settings.noHandle ? 'inline-block' : 'none'),
					'display': 'inline-block',
					'visibility': (!settings.noHandle ? 'visibe' : 'hidden'),
					'cursor': (!settings.disabled ? 'pointer' : 'default'),
					'font-size': '0',
					'position': 'relative',
					'z-index': '2'
				}).css(cssContentBox);

				follows.css({
					'position': 'absolute',
					'height': knobs.height()+'px',
					'width': '0',
					'left': '0'
				}).css(cssContentBox);
				follow1.css('z-index', '1');
				follow2.css('cursor', 'default');

				//------------------------------------------------------------------------------------------------------------------------------------
				// snap marks, vertical

				var preSnap = function(){
					// snap to nearest point on hard or snapOffset
					var was_locked = isLocked;
					if (was_locked) isLocked = false;

					if (snapType === 'hard'){
						target = knob1;
						snapDragon(knob1[0].offsetLeft);
						target = knob2;
						snapDragon(knob2[0].offsetLeft);
					} else if (snapType === 'soft'){
						const snapKnobs = el => {
							moved = true;
							target = el;
							doSnap('soft', el[0].offsetLeft);
						};

						snapKnobs(knob1);
						snapKnobs(knob2);
					}

					if (was_locked) isLocked = true;

					valueObj[guid] = getPercent(knob1.data('px'), knob2.data('px'));
				};

				// snap to
				const snaps = Math.round(settings.snap.points);
				var marks = null;
				var snapPctValues = [0];
				var snapPxlValues = [0];

				const setPixelValues = (sw, kw) => {
					snapPxlValues = [0];
					const increment = sw / (snaps - 1);
					let step = increment;

					while (step <= sw){
						snapPxlValues.push(step);
						step += increment;
					}
				};

				const setSnapValues = () => {
					if (snaps === 1) snaps = 2;

					// pixel
					const kw = (knob1.width() + knob2.width()) / 2;
					const sw = self_width - kw * 2;
					// snapPxlValues[0] += kw;

					setPixelValues(sw, kw);

					// percentage
					for (let snp of snapPxlValues){
						snapPctValues.push(snp / sw * 100);
					}

					snapPctValues[snapPctValues.length-1] = 100;

					if (markers) drawSnapmarks();
				};

				const drawSnapmarks = () => {
					let kw_ = knob1.width();

					self.after('<div id="'+guid+'_markers" class="sglide-markers"></div>');
					
					marks = $('#'+guid+'_markers');
					
					marks.css({
						'position': 'relative',
						'width': self_width+'px', //settings.width + unit,
						'margin': 'auto',
						'-webkit-touch-callout': 'none',
						'box-sizing': 'border-box'
					}).css(cssUserSelect);

					if (marks){
						let str = '', val = null;

						// for (var i = 0; i < snapValues.length; i++){
						// for (var i = snaps - 1; i >= 0; i--){
						for (let i = snaps - 1; i >= 0; i--){
							val = (self_width - kw_*2) / (snaps-1) * i + kw_;
							str += '<div style="width:0; height:5px; border-left:#333 solid 1px; position:absolute; left:'+val+'px"></div>';
						}

						marks.html(str);
					}
				};

				// -----------

				// vertical
				const verticalTransform = () => {
					if (markers && snaps > 0 && snaps < 10){
						const a = $('#'+guid+', #'+guid+'_markers');

						a.wrapAll('<div id="'+guid+'_vert-marks" style="margin:0; z-index:997; width:'+width+unit+
							'; -webkit-backface-visibility:hidden; -moz-backface-visibility:hidden; -ms-backface-visibility:hidden; backface-visibility:hidden; display:inline-block"></div>');

						vmarks = $('#'+guid+'_vert-marks');

						self.css('width', '100%');
						vmarks.css(cssContentBox).css(cssRotate);
						a.css('margin', '0');
					} else {
						// check whether even by even or odd by odd to fix blurred elements
						self.css({
							'margin': '0', 'top': '0', 'left': '0',
							'backface-visibility': 'hidden',
							'display': 'inline-block'
						}).css(cssRotate);
					}
					self.addClass('vertical');
				};

				//------------------------------------------------------------------------------------------------------------------------------------
				// events

				var is_down	= false,
					target	= null,

					barDrag = false,
					z		= null;

				// snapping
				// var storedSnapValues = {'from': null, 'to': null};
				var storedSnapValues = valueObj[guid];	//[-1, -1];
				// var storedSnapValues = valueObj[guid];
				var is_same = false;
				var storedBarSnapValue = null;
				var is_onSnapPoint = false;
				// var was_onSnapPoint = false;
				var was_onSnapPoint_left = true;
				var was_onSnapPoint_right = true;
				var simulSnapped = false;
				var moved = false;

				const doSnap = (kind, m) => {
					if (is_snap){
						const sense = settings.snap.sensitivity;

						// although snap is enabled, sensitivity may be set to nill, in which case marks are drawn but won't snap to
						if (sense || snapType === 'hard' || snapType === 'soft'){
							const knobWidthHalf		= target.width(),
								knobWidth			= knobWidthHalf * 2,
								knobWidthQuarter	= knobWidthHalf / 2,
								snapOffset			= (sense && sense > 0 && sense < 4 ? (sense + 1) * 5 : 15) - 3;

							// get closest px mark, and set %
							let closest = null, pctVal = 0;
							$.each(snapPxlValues, (i, num) => {
								if (closest === null || Math.abs(num - m) < Math.abs(closest - m)){
									closest = num;// | 0.0;
									pctVal = snapPctValues[i];
								}
							});

							// if locked, get closest mark for other knob
							if (isLocked || barDrag || barDrag_drop){
								var closest_n = null, pctVal_n = 0, n = 0;

								if (target[0] === knob1[0]) n = m + lockedDiff - target.width();//*0.75;
								else n = m - lockedDiff;// - target.width() * 0.5;

								$.each(snapPxlValues, (i, num) => {
									if (closest_n === null || Math.abs(num - n) < Math.abs(closest_n - n)){
										closest_n = num;// | 0;
										pctVal_n = snapPctValues[i];
									}
								});
							}

							// ----------------------------------------------------
							// physically snap it

							let boolN = false;
							const lockedRangeAdjusts = () => {
								// first compare which is closer: m or n
								// if n, m = n, closest = closest_n
								// if locked & startAts different
								if ((isLocked || barDrag) && settings.startAt[0] !== settings.startAt[1]){
									// snap other, else snap current knob
									let currentKnobToClosest = Math.abs(closest - m + knobWidthHalf);
									let otherKnobToClosest = Math.abs(closest_n - n);

									simulSnapped = Math.abs(currentKnobToClosest - otherKnobToClosest) < 1;

									if (currentKnobToClosest > otherKnobToClosest){
										console.log('>> other');
										boolN = true;
										closest = closest_n;
										m = (target[0] === knob1[0]) ? n+knobWidthHalf*0.875 : n; // revise!!
										// m = n;
									} else {
										console.log('>> current');
										m = (target[0] === knob2[0]) ? m-knobWidthHalf*0.875 : m;
									}
								} else if (target[0] === knob2[0]) m -= knobWidthHalf*0.875;	// knob2 adjust
							};

							if (kind === 'drag'){
								if (snapType === 'hard'){


									if (barDrag){
										// console.log('>> >>', storedSnapValues, valueObj[guid]);
										// if (storedSnapValues[0] !== valueObj[guid][0] || storedSnapValues[1] !== valueObj[guid][1]) is_onSnapPoint = true;
										// valueObj[guid] = storedSnapValues;
										if (Math.abs(closest_n - knob1[0].offsetLeft) < Math.abs(closest - knob2[0].offsetLeft)){
											target = knob1;
											snapUpdate(closest_n, knobWidth);
											was_onSnapPoint_right = true;
											target = knob2;// reset
										} else {
											snapUpdate(closest, knobWidth);
											was_onSnapPoint_left = true;
										}
									} else {
										switch (target[0]){
											case knob1[0]: was_onSnapPoint_left = true; break;
											case knob2[0]: was_onSnapPoint_right = true; break;
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
										// was_onSnapPoint = true;
										if (target[0] === knob1[0] || barDrag && boolN) was_onSnapPoint_left = true;
										else if (target[0] === knob2[0]) was_onSnapPoint_right = true;
									}
								}
							} else {
								lockedRangeAdjusts();
								// snapUpdate(closest, knobWidth, boolN);

								if (barDrag_drop){
									// if (storedSnapValues[0] !== valueObj[guid][0] || storedSnapValues[1] !== valueObj[guid][1]) is_onSnapPoint = true;
									// valueObj[guid] = storedSnapValues;
									if (Math.abs(closest_n - knob1[0].offsetLeft + knobWidthHalf) < Math.abs(closest - knob2[0].offsetLeft)){
										target = knob1;
										was_onSnapPoint_left = true;	// seems to work, not sure why
										snapUpdate(closest_n, knobWidth);
										was_onSnapPoint_right = true;
										target = knob2;// reset
										return closest_n;
									} else {
										was_onSnapPoint_right = true;	// seems to work, not sure why
										snapUpdate(closest, knobWidth);
										was_onSnapPoint_left = true;
										return closest;
									}
								} else {
									switch (target[0]){
										case knob1[0]: was_onSnapPoint_left = true; break;
										case knob2[0]: was_onSnapPoint_right = true; break;
									}

									snapUpdate(closest, knobWidth);
									return closest;
								}

							}
						}
					}
				};

				const snapOutput = (which, closest) => { // callback: onSnap
					if (snapType === 'hard'){
						let p = null;
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
						options.onSnap.call(self[0], updateME.apply(this, pcts));
					}

				};

				const snapUpdate = (closest, knobWidth, isN) => {
					var getFollowPos = () => (closest+knobWidth/4+knobWidth/2);
					
					var followPos = getFollowPos();
					var diff = null;

					// -----------------------------

					if ((target[0] === knob1[0] && !isN) || (target[0] === knob2[0] && isN)){
						diff = () => (closest+lockedDiff-knobWidth/2);

						// patch: constraint right: if new knob2 pos > end knob2 pos, set new closest value;
						if ((isLocked || barDrag || barDrag_drop) && diff() > (self_width - knobWidth))
							closest -= diff() - (self_width - knobWidth);
						else

						// constrain left knob to left side - glitch most evident at hard snap
						// a prior constraint is already set, but you need this extra one - leave it active
						if (closest > knob2[0].offsetLeft - (knobWidth/2))// && snapType === 'hard')
							closest = knob2[0].offsetLeft - (knobWidth/2);

						knob1.css('left', closest).data('px', closest);
						follow1.css('width', (closest+knobWidth/4));

						if (isLocked || barDrag || barDrag_drop){
							knob2.css('left', diff()).data('px', diff());
							follow2.css('width', (closest+knobWidth/4+lockedDiff));
						}

						// output
						if (was_onSnapPoint_left){
							snapOutput(0, closest);
							was_onSnapPoint_left = false;
							was_onSnapPoint_right = is_onSnapPoint;	// must on hard-snap; but causes double snap when both knob snapped
						}
					} else {
						diff = () => (closest-lockedDiff+knobWidth/2);

						// patch: constraint left: if new knob1 pos < 0, set new closest value;
						if ((isLocked || barDrag || barDrag_drop) && (closest-lockedDiff+knobWidth/2) <= 0)
							// closest -= closest-lockedDiff+knobWidth/2;
							closest -= diff();
						else

						// constrain right knob to right side - glitch most evident at hard snap
						// a prior constraint is already set, but you need this extra one - leave it active
						if (closest < knob1[0].offsetLeft)// && snapType === 'hard')
							closest = knob1[0].offsetLeft;

						followPos = getFollowPos();

						knob2.css('left', closest).data('px', closest);
						follow2.css('width', followPos);

						if (isLocked || barDrag || barDrag_drop){
							knob1.css('left', diff()).data('px', diff());
							follow1.css('width', (followPos-lockedDiff));
						}

						// output
						if (was_onSnapPoint_right){
							snapOutput(1, closest);
							was_onSnapPoint_right = false;
							was_onSnapPoint_left = is_onSnapPoint;	// must on hard-snap; but causes double snap when both knob snapped
						}
					}
				};

				var z = null;
				var a = false, b = false; // used to mitigate constraint checkers
				var barDrag_drop = false;

				const eventDocumentMouseMove = e => {
					if (is_down){
						e = e || event;	// ie fix
						moved = true;

						// e.preventDefault();
						// e.stopPropagation();

						let x			= null,
							knobWidth	= knobs.width();

						if (vert){
							let base = (markers ? vmarks.position().top : self.position().top) + self_width;
							if (isMobile){
								touchY = e.originalEvent.touches[0].pageY;
								x = base - touchY;
							} else x = base - e.pageY;
						} else {
							if (isMobile){
								touchX = e.originalEvent.touches[0].pageX;
								x = touchX - self.offset().left;
							} else x = e.pageX - self.offset().left;
						}

						if (barDrag){
							if (z === null) z = target[0].offsetLeft - x + (knobWidth / 2);
							// if (z === null) z = target.data('px') + knobWidth - x + knobWidth / 2;
							x += z;
							if (!gotLockedPositions) getLockedPositions();
						}

						let stopper = knobWidth / 2;
						let m = x - stopper;

						// if(event.preventDefault) event.preventDefault();
						if (e.returnValue) e.returnValue = false;

						let targetEl	= target[0],
							knob1El		= knob1[0],
							knob2El		= knob2[0];
							// follow1El	= follow1[0],
							// follow2El	= follow2[0];

						if (!isLocked && !barDrag){
							if (targetEl === knob1El){
								let knob2_style_left	= knob2.data('px');
								let knob2_offset_left	= knob2El.offsetLeft;

								if (x <= stopper && (!is_snap || snapType !== 'hard')){
									if (b) b = false;
									if (!a){
										// targetEl.style.left = '0';
										knob1.css('left', 0).data('px', 0);
										follow1.css('width', stopper);
										a = true;
									}
								} else if (x >= knob2_offset_left-stopper && (!is_snap || snapType !== 'hard')){
									if (a) a = false;
									if (!b){
										// targetEl.style.left = knob2_style_left;
										knob1.css('left', knob2_style_left).data('px', knob2_style_left);
										follow1.css('width', (knob2_offset_left-stopper));
										if (snapType === 'hard') snapOutput(getPercent([result_from, result_to]).percentRange[1], 'from');
										b = true;
									}
								} else {
									a = b = false;
									// targetEl.style.left = (x-stopper)+'px';
									knob1.css('left', (x-stopper)).data('px', (x-stopper));
									follow1.css('width', x);
									snapDragon(m);
								}
							} else if (targetEl === knob2El){
								let knob1_style_left	= knob1.data('px');
								let knob1_offset_left	= knob1El.offsetLeft;

								if (x <= knob1_offset_left+stopper+knobWidth && (!is_snap || snapType !== 'hard')){
									if (b) b = false;
									if (!a){
										// targetEl.style.left = knob1_style_left;
										knob2.css('left', knob1_style_left).data('px', knob1_style_left);
										follow2.css('width', (knob1_offset_left+stopper+knobWidth));
										if (snapType === 'hard') snapOutput(getPercent([result_from, result_to]).percentRange[0], 'to');
										a = true;
									}
								} else if (x >= self_width-stopper && (!is_snap || snapType !== 'hard')){
									if (a) a = false;
									if (!b){
										// targetEl.style.left = (self_width-knobWidth*2)+'px';
										knob2.css('left', (self_width-knobWidth*2)).data('px', (self_width-knobWidth*2));
										follow2.css('width', (self_width-stopper));
										b = true;
									}
								} else {
									a = b = false;
									knob2.css('left', (x-stopper-knobWidth)).data('px', (x-stopper-knobWidth));
									follow2.css('width', x);
									snapDragon(m);
								}
							}
						} else {
							if (targetEl === knob1El){
								if (x <= stopper && (!is_snap || snapType !== 'hard')){
									if (b) b = false;
									if (!a){
										knob1.css('left', 0).data('px', 0);
										follow1.css('width', stopper);

										knob2.css('left', (lockedDiff-knobWidth)).data('px', (lockedDiff-knobWidth));
										follow2.css('width', (lockedDiff+stopper));
										a = true;
									}
								} else if (x >= self_width-lockedDiff-stopper && (!is_snap || snapType !== 'hard')){
									if (a) a = false;
									if (!b){
										knob2.css('left', (self_width-knobWidth*2)).data('px', (self_width-knobWidth*2));
										follow2.css('width', (self_width-stopper));

										knob1.css('left', (self_width-lockedDiff-knobWidth)).data('px', (self_width-lockedDiff-knobWidth));
										follow1.css('width', (self_width-lockedDiff-stopper));
										b = true;
									}
								} else {
									a = b = false;
									knob1.css('left', (x-stopper)).data('px', (x-stopper));
									follow1.css('width', x);

									knob2.css('left', (x-stopper-knobWidth+lockedDiff)).data('px', (x-stopper-knobWidth+lockedDiff));
									follow2.css('width', (x+lockedDiff));
									snapDragon(m);
								}
							} else if (targetEl === knob2El){
								if (x <= lockedDiff+stopper && (!is_snap || snapType !== 'hard')){
									if (b) b = false;
									if (!a){
										knob2.css('left', (lockedDiff-knobWidth)).data('px', (lockedDiff-knobWidth));
										follow2.css('width', (lockedDiff+stopper));

										knob1.css('left', 0).data('px', 0);
										follow1.css('width', stopper);
										a = true;
									}
								} else if (x >= self_width-stopper && (!is_snap || snapType !== 'hard')){
									if (a) a = false;
									if (!b){
										knob2.css('left', (self_width-knobWidth*2)).data('px', (self_width-knobWidth*2));
										follow2.css('width', (self_width-stopper));

										knob1.css('left', (self_width-lockedDiff-knobWidth)).data('px', (self_width-lockedDiff-knobWidth));
										follow1.css('width', (self_width-lockedDiff-stopper));
										b = true;
									}
								} else {
									a = b = false;
									knob2.css('left', (x-stopper-knobWidth)).data('px', (x-stopper-knobWidth));
									follow2.css('width', x);

									knob1.css('left', (x-stopper-lockedDiff)).data('px', (x-stopper-lockedDiff));
									follow1.css('width', (x-lockedDiff));
									snapDragon(m);
								}
							}
						}

						// results
						setResults();

						/*var state = self.data('state');
						var value = updateME(getPercent(result_from), getPercent(result_to));

						// update values
						if (options.drag && state === 'active')
							options.drag.call(self[0], value);*/


						// update values
						if (options.drag && self.data('state') === 'active'){
							const value = updateME.apply(this, getPercent(result_from, result_to));
							valueObj[guid] = value.percentRange;
							options.drag.call(self[0], value);
						}
					}
				};

				const eventDocumentMouseUp = e => {
					barDrag_drop = barDrag;
					const state = self.data('state');
					is_down = barDrag = gotLockedPositions = a = b = false;
					z = null;
					if (state === 'active'){
						if (snapType !== 'hard'){
							e = e || event;	// ie fix
							let x = null, base = 0;
							const knobWidth	= knobs.width();

							if (vert){
								base = (markers ? vmarks.position().top : self.position().top) + self_width;
								// console.log('>> base', vmarks.position().top);
								x = base - ((!isMobile ? e.pageY : touchY)-2);
							} else x = (!isMobile ? e.pageX : touchX) - self.offset().left;

							if (barDrag_drop){
								if (z === null) z = target[0].offsetLeft - x + (knobWidth / 2);
								// if (z === null) z = target.data('px') + knobWidth - x + knobWidth / 2;
								x += z;
								if (!gotLockedPositions) getLockedPositions();
							}

							const stopper	= (target[0] === knob2[0]) ? knobWidth * 1.5 : knobWidth / 2;
							const m			= x - stopper;	// true position of knob

							// snap to
							if (barDrag_drop && snapType === 'soft'){
								doSnap('soft', m); // send m, not x
							} else {
								if (is_snap && snapType === 'soft'){
									if (target[0] === knob1[0] && m <= knob2[0].offsetLeft)
										result_from = doSnap('soft', m);
									else if (target[0] === knob2[0] && m >= knob1[0].offsetLeft)
										result_to = doSnap('soft', m);
								}
							}

							const value = updateME.apply(this, getPercent(result_from, result_to));
							valueObj[guid] = value.percentRange;

							if (options.drop) options.drop.call(self[0], value);
							if (options.drag && state === 'active') options.drag.call(self[0], value);
						}
						self.data('state', 'inactive');
					}
					gotLockedPositions = barDrag_drop = false;
					z = null;
				};

				const snapDragon = m => {
					if (is_snap && !snapType || snapType === 'hard') doSnap('drag', m);
				}

				const initEventHandlers = () => {
					// init event handlers
					if (!settings.disabled){
						knobs.on(mEvt.down, e => {
							target = $(e.target);
							is_down = true;
							self.data('state', 'active');
						}).on(mEvt.up, () => {is_down = false});

						$(document).on(mEvt.move+'.'+guid, eventDocumentMouseMove).on(mEvt.up+'.'+guid, eventDocumentMouseUp);

						follow2.on(mEvt.down, () => {
							is_down = barDrag = true;
							target = knob2;//knobs.eq(1);
							self.data('state', 'active');
						}).on(mEvt.up, () => {is_down = false});

						// touch event handlers
						if (isMobile){
							$(document).on(mEvt.down+'.'+guid, e => {
								// is_down = false;
								touchX = e.originalEvent.touches[0].pageX;
								touchY = e.originalEvent.touches[0].pageY;
							});
						}
					}

					$(window).on('resize.'+guid, () => {
						if (!vert){
							self_width = Math.round(self.width());

							var val = null;
							var kw1	= knob1.width();
							var pos	= (arr => {
								for (let v of valueObj[guid]){
									arr.push(v / 100 * (self_width - kw1) + (kw1/2));
								}
								return arr;
							})([]);

							self.sGlideRange('startAt', valueObj[guid]);

							if (marks){
								setPixelValues((self_width - kw1 * 2), kw1);
								marks.css('width', self_width)
								.children('div').each((i, mark) => {
									val = (self_width - kw1*2) / (snaps-1) * i + kw1;
									$(mark).css('left', val);
								});
							}
						}
					});
				};

				//------------------------------------------------------------------------------------------------------------------------------------
				// functions

				const setResults = () => {
					result_from	= knob1.data('px') || knob1[0].offsetLeft || 0;
					result_to	= knob2.data('px') || (knob2[0].offsetLeft - knob2.width()) || 0;
				};

				// set locked positions
				var lockedKnob1Pos		= null,
					lockedKnob2Pos		= null,
					lockedDiff			= null,
					gotLockedPositions	= false;

				const getLockedPositions = () => {
					lockedKnob1Pos	= knob1.data('px') || knob1[0].offsetLeft;
					lockedKnob2Pos	= knob2.data('px') || knob2[0].offsetLeft;
					lockedDiff		= lockedKnob2Pos - lockedKnob1Pos + knob2.width();
					gotLockedPositions = true;
				};

				if (customRange){
					var cstmStart = settings.totalRange[0];
					var diff = settings.totalRange[1] - cstmStart;
				}

				const getPercent = (a, b) => {
					var sw = self_width - knob1.width() - knob2.width();
					var pctA = null, pctB = null;

					if (a || a === 0){
						// var pctA = (a + knob1.width()) / sw * 100;
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
						const toCustom = pct => diff * pct / 100 + cstmStart;
						sendData.customRange = [toCustom(_from), toCustom(_to)];
					}

					return sendData;
				};

				//------------------------------------------------------------------------------------------------------------------------------------
				// start

				const setStartAt = () => {
					self.sGlideRange('startAt', valueObj[guid]);
					setResults();

					// inits
					initEventHandlers();
					
					if (is_snap)		setSnapValues();
					if (vert)			verticalTransform();
					if (snapType === 'hard' || snapType === 'soft') preSnap();
					if (isLocked)		getLockedPositions();
					// if (options.onload)	options.onload(rlt);

					const rlt = updateME.apply(this, valueObj[guid]);

					$(el).off('makeready.'+guid, setStartAt).trigger('sGlide.ready', [rlt]);
				};

				// Listen for image loaded
				const eventMakeReady = $.Event('makeready.'+guid);
				$(el).on('makeready.'+guid, setStartAt);
			});
		}
	};
	$.fn.sGlideRange = function(params){
		// Method calling logic
		if (methods[params]){
			return methods[params].apply(this, Array.prototype.slice.call(arguments, 1));
		} else if (typeof params === 'object' || !params){
			return methods.init.apply(this, arguments);
		} else {
			$.error('Method '+params+' does not exist on jQuery.sGlideRange');
		}
	};
})(jQuery);