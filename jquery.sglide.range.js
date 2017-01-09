/*global window:false, console:false, document:false, event:false, jQuery:false */

/***********************************************************************************

author:		Daniel Kazmer - http://webshifted.com
created:	1.11.2014
version:	1.2.1

	version history:
		1.2.1	added snap sensitivity - accepts decimal values between 0 & 3 inclusive; added bar-drag; bug fix: get correct values at onSnap by sending them within setTimeout 0; cleaner: relying on offset values instead of style (type String) (26.04.2016)
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
			drop/drag/onSnap/onload: function(o){
				console.log('returned object',o);
			}
		});

		All properties are optional. To retrieve data, use one of the callbacks

	goals:
		- test: positions of locked handles when startAt point specified
		- if unit is %, then markers should be also
		- fix bug: rebuilding vertical rotates again

***********************************************************************************/

(function($){
	var valueObj	= {};
	var isMobile	= false;
	var methods		= {
		destroy: function(){
			this.each(function(i, el){
				var self	= $(el);
				var id		= self.selector;
				var guid	= self.attr('id');

				// unwrap vertical
				var vertContainer = $('#'+guid+'_vert-marks');
				if (vertContainer[0]) self.unwrap();

				var markers = $('#'+guid+'_markers');
				if (markers.length > 0) markers.remove();

				var mEvt = {
					'down'	: 'mousedown',
					'up'	: 'mouseup',
					'move'	: 'mousemove'
				};

				if (isMobile){
					mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
				} else
					$(document).off('keydown.'+guid).off('keyup.'+guid);

				$(document).off(mEvt.move+'.'+guid).off(mEvt.up+'.'+guid);
				$(window).off('orientationchange.'+guid);
				self.off(mEvt.down);
				self.children('.slider_knob').off(mEvt.up).off(mEvt.down).remove();
				self.children('.follow_bar').off(mEvt.down).remove();
				self.removeAttr('style').removeClass('vertical');
			});
			return this;
		},
		startAt: function(pct, animated){
			this.each(function(index, el){
				var self		= $(el);
				var knobs		= self.children('.slider_knob'),
					knob1		= self.children('.s_knob1'),
					knob2		= self.children('.s_knob2'),
					follows		= self.children('.follow_bar'),
					follow1		= self.children('.follow1'),
					follow2		= self.children('.follow2'),
					guid		= self.attr('id');

				valueObj[guid] = pct;

				// set pixel positions
				var selfWidth	= self.width(),
					knobWidth	= knob1.width() * 2,
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
				if (animated){
					knob1.animate({'left': pxAdjust[0]+'px'}, 200);
					knob2.animate({'left': pxAdjust[1]+'px'}, 200);
					follow1.animate({'width': px[0]+'px'}, 200);
					follow2.animate({'width': px[1]+'px'}, 200);
				} else {
					knob1.css('left', pxAdjust[0]+'px');
					knob2.css('left', pxAdjust[1]+'px');
					follow1.css('width', (px[0]-knobWidth/4)+'px');
					follow2.css('width', (px[1]+knobWidth/4)+'px');
				}
			});
			return this;
		},
		init: function(options){
			this.each(function(i, el){

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

				var settings = $.extend({
					'startAt'		: [0,0],
					'image'			: 'none',	// full path of image
					'height'		: 40,
					'width'			: 100,
					'unit'			: '%',	// 'px' or '%'
					'pill'			: true,
					'snap'			: {
						'marks'		: false,
						'type'		: false,
						'points'	: 0
					},
					'disabled'		: false,
					'vertical'		: false,
					'totalRange'	: [0,0],
					'locked'		: false,
					'retina'		: true
				}, options);

				self.removeAttr('style');	// remove user inline styles

				var mEvt		= {
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

				// variables
				valueObj[guid]		= settings.startAt;
				var result_from		= 0,
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
					imgLoaded		= false,
					resize			= false,
					retina			= (window.devicePixelRatio > 1) && settings.retina,
					customRange		= (settings.totalRange[0] !== 0 || settings.totalRange[1] !== 0) && settings.totalRange[0] < settings.totalRange[1],
					isLocked		= settings.locked;

				//------------------------------------------------------------------------------------------------------------------------------------
				// image handling

				if (imageBln){	// if image
					var img = settings.image;

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
						// patch: conflict with multiple sliders
						img = $.extend([], img);

						// retina handling
						if (retina){
							img[0] = processRetinaImage(img[0]);
							img[1] = processRetinaImage(img[1]);
						}

						knobs.html('<img src="" style="visibility:hidden; position:absolute" />');
						var newImage = null;
						var multiImageIndex = 0;
						var loadNextImage = function(el){
							newImage = el.find('img');
							newImage.attr('src', img[multiImageIndex]).load(function(){

								var thisHeight = newImage[0].naturalHeight;

								if (retina){
									newImage.width(newImage[0].naturalWidth/2);
									thisHeight		= newImage.height();
									knob_width_css	= newImage.width()+'px';
									knob_height_css	= thisHeight+'px';
								} else {
									knob_width_css	= newImage[0].naturalWidth+'px';
									knob_height_css	= thisHeight+'px';
								}

								knob_bg = 'url('+img[multiImageIndex]+') no-repeat';
								var knob_bg_styles = {
									'width': knob_width_css,
									'height': knob_height_css,
									'background': knob_bg
								};
								if (retina) knob_bg_styles['background-size'] = '100%';

								el.css(knob_bg_styles);

								newImage.remove();

								if (multiImageIndex < 1){
									multiImageIndex++;
									loadNextImage(knob2);
								} else {
									follows.css({
										'height': knob_height_css,
										'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0'
									});
									self.css({
										'height': knob_height_css,
										'border-radius': r_corners ? thisHeight / 2 + 'px' : '0'
									});

									$(el).trigger(eventMakeReady);

									var settings_height = settings.height;
									if (thisHeight > settings_height){
										var knobMarginValue = (thisHeight-settings_height)/2;
										self.css('height', settings_height+'px');
										knobs.css('top', '-'+knobMarginValue+'px');
										follows.css({
											'height': settings_height+'px',
											'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0'
										});
									} else {
										// children stay inside parent
										self.css('overflow', 'hidden');
									}
								}
							});
						};
						loadNextImage(knob1);
					} else {
						knobs.html('<img src="'+img+'" style="visibility:hidden; position:absolute" />');

						// retina handling
						if (retina) img = processRetinaImage(img);

						knobs.children('img').load(function(){
							var imgEl = $(this);
							var thisHeight = imgEl[0].naturalHeight;
							
							knob_width_css = imgEl[0].naturalWidth+'px';
							knob_height_css = thisHeight+'px';

							knob_bg = 'url('+img+') no-repeat';
							var knob_bg_styles = {
								'width': knob_width_css,
								'height': knob_height_css,
								'background': knob_bg
							};
							if (retina) knob_bg_styles['background-size'] = '100%';

							knobs.css(knob_bg_styles);
							follows.css({
								'height': knob_height_css,
								'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0'
							});
							self.css({
								'height': knob_height_css,
								'border-radius': r_corners ? thisHeight / 2 + 'px' : '0'
							});

							imgEl.remove();

							$(el).trigger(eventMakeReady);

							var settings_height = settings.height;
							if (thisHeight > settings_height){
								var knobMarginValue = (thisHeight-settings_height)/2;
								self.css('height', settings_height+'px');
								knobs.css('top', '-'+knobMarginValue+'px');
								follows.css({
									'height': settings_height+'px',
									'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0'
								});
							} else {
								// children stay inside parent
								self.css('overflow', 'hidden');
							}
						});
					}
				} else {
					var d = settings.height / 2;
					self.css({'border-radius': (r_corners ? d+'px' : '0'), 'overflow': 'hidden'});
					follows.css('border-radius', (r_corners ? d+'px 0 0 '+d+'px' : '0'));

					setTimeout(function(){
						$(el).trigger(eventMakeReady);
					}, 0);
				}

				//------------------------------------------------------------------------------------------------------------------------------------
				// styles

				// validate some user settings
				var unit = settings.unit, width = settings.width;
				if (unit != 'px' && unit != '%') unit = '%';
				else if (unit == 'px') width = Math.round(width);
				else if (unit == '%' && Math.round(width) > 100) width = 100;

				self.css({
					'width': width + unit,
					'height': self_height,
					'text-align': 'left',
					'margin': 'auto',
					'z-index': '997',
					'position': 'relative',
					'-webkit-touch-callout': 'none'
				});

				var self_width = self.width();

				var cssContentBox = {
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
					'-webkit-transform': 'rotate(-90deg)',
					'-khtml-transform': 'rotate(-90deg)',
					'-moz-transform': 'rotate(-90deg)',
					'-ms-transform': 'rotate(-90deg)',
					'transform': 'rotate(-90deg)',
					'-webkit-transform-origin': self_width+'px 0',
					'-khtml-transform-origin': self_width+'px 0',
					'-moz-transform-origin': self_width+'px 0',
					'-ms-transform-origin': self_width+'px 0',
					'transform-origin': self_width+'px 0',
					'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'
				};

				self.css(cssContentBox).css(cssUserSelect);

				knobs.css({
					'width': knob_width_css,
					'background': knob_bg,
					'height': knob_height_css,
					'display': (!settings.disabled ? 'inline-block' : 'none'),
					'font-size': '0',
					'cursor': (!settings.disabled ? 'pointer' : 'default'),
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

				// snap to
				var snapping_on = false;
				var snaps = Math.round(settings.snap.points);
				var snapPctValues = [0];
				var drawSnapmarks = function(resize){
					if (snaps === 1) snaps = 2;
				
					// pixels
					var kw = knob1.width()*2;
					var w = self_width - kw;
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
							self.after('<div id="'+guid+'_markers"></div>');
							
							marks = $('#'+guid+'_markers');
							
							marks.css({
								'width': self_width+'px', //settings.width + unit,
								'margin': 'auto',
								'padding-left': (kw/2)+'px',
								'-webkit-touch-callout': 'none',
								'box-sizing': 'border-box'
							}).css(cssUserSelect);
						} else {
							marks = $('#'+guid+'_markers');
							marks.html('');
						}

						var str = '';

						for (var i = 0; i < snapValues.length; i++)
							str += '<div style="display:inline-block; width:0; height:5px; border-left:#333 solid 1px; position:relative; left:'+
								(snapValues[i]-i)+'px; float:left"></div>';

						marks.html(str);
					}
				};

				// -----------

				// vertical
				var verticalTransform = function(){
					if (markers && snaps > 0 && snaps < 10){
						var a = $('#'+guid+', #'+guid+'_markers');

						a.wrapAll('<div id="'+guid+'_vert-marks" style="margin:0; z-index:997; width:'+width+unit+
							'; -webkit-backface-visibility:hidden; -moz-backface-visibility:hidden; -ms-backface-visibility:hidden; backface-visibility:hidden"></div>');

						var vmarks = $('#'+guid+'_vert-marks');

						self.css('width', '100%');
						vmarks.css(cssContentBox).css(cssRotate);

						for (var i = 0; i < a.length; i++)
							a.css('margin', '0');
					} else {
						// check whether even by even or odd by odd to fix blurred elements
						self.css({
							'margin': '0', 'top': '0', 'left': '0',
							'backface-visibility': 'hidden'
						}).css(cssRotate);
					}
					self.addClass('vertical');
				};

				//------------------------------------------------------------------------------------------------------------------------------------
				// events

				// knob
				var is_down	= false,
					target	= null;

				knobs.on(mEvt.down, function(e){
					target = $(e.target);
					is_down = true;
					self.data('state', 'active');
				}).on(mEvt.up, function(){
					is_down = false;
				});

				var barDrag = false;
				if (!snapType || isLocked){
					follow2.on(mEvt.down, function(){
						barDrag = true;
						target = knob2;//knobs.eq(1);
						is_down = true;
						self.data('state', 'active');
					}).on(mEvt.up, function(){
						is_down = false;
						barDrag = false;
					});
				}

				// snapping
				var storedSnapValues = ['a-1', 'b-1'];
				var doSnap = function(kind, m){
					if (snaps > 0 && snaps < 10){	// min 1, max 9
						var sense = (settings.snap.sensitivity !== undefined ? settings.snap.sensitivity : 2);

						// although snap is enabled, sensitivity may be set to nill, in which case marks are drawn but won't snap to
						if (sense || snapType === 'hard' || snapType === 'soft'){
							var knobWidthHalf		= target.width(),
								knobWidth			= knobWidthHalf * 2,
								knobWidthQuarter	= knobWidthHalf / 2,
								snapOffset			= (sense && sense > 0 && sense < 4 ? (sense + 1) * 5 : 15) - 3;

							// % to px
							var snapPixelValues = [];
							for (var i = 0; i < snapPctValues.length; i++)
								snapPixelValues.push((self_width - knobWidth) * snapPctValues[i] / 100);

							// get closest px mark, and set %
							var closest = null, pctVal = 0;
							$.each(snapPixelValues, function(i){
								if (closest === null || Math.abs(this - m) < Math.abs(closest - m)){
									closest = this | 0;
									pctVal = snapPctValues[i];
								}
							});

							// if locked, get closest mark for other knob
							if (isLocked || barDrag){
								var closest_n = null, pctVal_n = 0, n = 0;

								if (target[0] === knob1[0]) n = m + lockedDiff-target.width()*0.75; else n = m - lockedDiff;

								$.each(snapPixelValues, function(i){
									if (closest_n === null || Math.abs(this - n) < Math.abs(closest_n - n)){
										closest_n = this | 0;
										pctVal_n = snapPctValues[i];
									}
								});
							}

							// ----------------------------------------------------
							// physically snap it

							var boolN = false;
							var lockedRangeAdjusts = function(){
								// first compare which is closer: m or n
								// if n, m = n, closest = closest_n
								// if locked & startAts different
								if ((isLocked || barDrag) && settings.startAt[0] !== settings.startAt[1]){
									// snap other, else snap current knob
									if (Math.abs(closest - m) > Math.abs(closest_n - n)){
										boolN = true;
										closest = closest_n;
										m = (target[0] === knob1[0]) ? n-knobWidthQuarter : n;
									} else {
										m = (target[0] === knob2[0]) ? m-knobWidthHalf : m;
									}
								} else if (!isLocked && target[0] === knob2[0]) m -= knobWidthHalf;	// knob2 adjust
							};

							if (kind === 'drag'){
								if (snapType === 'hard'){
									updateSnap(closest, knobWidth);
									console.log('>> knkob is', target[0]);
									doOnSnap(closest, pctVal, ((target[0] === knob1[0]) ? 'from' : 'to'));

								} else {
									lockedRangeAdjusts();

									if (Math.round(Math.abs(closest - m + knobWidthHalf/8)) < snapOffset){
										updateSnap(closest, knobWidth, false, boolN);
										doOnSnap(closest, pctVal, ((target[0] === knob1[0]) ? 'from' : 'to'));

									} else storedSnapValues = ['a-1', 'b-1'];
								}
							} else if (kind === 'hard'){
								lockedRangeAdjusts();
								updateSnap(closest, knobWidth, false, boolN);
								return closest;
							} else {
								lockedRangeAdjusts();
								updateSnap(closest, knobWidth, true, boolN);
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
// else if neither (barDrag)
					if (options.onSnap && ab !== storedSnapValues[storedSnapIndex]){
						storedSnapValues[storedSnapIndex] = ab;
						var snapObj = null;

						if (which === 'to')
							snapObj = updateME(getPercent([(storedSnapValues[0].indexOf('-1') !== -1) ? valueObj[guid][0] : storedSnapValues[0], b]));
						else
							snapObj = updateME(getPercent([b, (storedSnapValues[1].indexOf('-1') !== -1) ? valueObj[guid][1] : storedSnapValues[1]]));

						// options.onSnap(snapObj);
						setTimeout(options.onSnap, 0, snapObj);
					}
				// }, updateSnap = function(knb, fllw, knobPos, followPos, animateBln){
				}, updateSnap = function(closest, knobWidth, animateBln, isN){
					var getFollowPos = function(){
						return (closest+knobWidth/4+knobWidth/2);
					};
					
					followPos = getFollowPos();

					var patchConstraintLeft = function(){
						// patch: constraint left: if new knob1 pos < 0, set new closest value;
						if ((isLocked || barDrag) && (closest-lockedDiff+knobWidth/2) <= 0){
							closest -= closest-lockedDiff+knobWidth/2;
							followPos = getFollowPos();
						}
					};
					var patchConstraintRight = function(){
						// patch: contraint right: if new knob2 pos > end knob2 pos, set new closest value;
						if ((isLocked || barDrag) && (closest+lockedDiff-knobWidth/2) > (self_width - knobWidth)){
							closest -= (closest+lockedDiff-knobWidth/2) - (self_width - knobWidth);
						}
					};

					// -----------------------------

					if (!animateBln){
						if ((target[0] === knob1[0] && !isN) || (target[0] === knob2[0] && isN)){
							patchConstraintRight();

							knob1[0].style.left		= closest+'px';
							follow1[0].style.width	= (closest+knobWidth/4)+'px';

							if (isLocked || barDrag){
								knob2[0].style.left		= (closest+lockedDiff-knobWidth/2)+'px';
								follow2[0].style.width	= (closest+knobWidth/4+lockedDiff)+'px';
							}
						} else {
							patchConstraintLeft();

							knob2[0].style.left		= closest+'px';
							follow2[0].style.width	= followPos+'px';

							if (isLocked || barDrag){
								knob1[0].style.left		= (closest-lockedDiff+knobWidth/2)+'px';
								follow1[0].style.width	= (followPos-lockedDiff)+'px';
							}
						}
					} else {
						if ((target[0] === knob1[0] && !isN) || (target[0] === knob2[0] && isN)){
							patchConstraintRight();

							knob1.animate({'left': closest+'px'}, 'fast');
							follow1.animate({'width': (closest+knobWidth/4)+'px'}, 'fast');

							if (isLocked || barDrag){
								knob2.animate({'left': (closest+lockedDiff-knobWidth/2)+'px'}, 'fast');
								follow2.animate({'width': (closest+knobWidth/4+lockedDiff)+'px'}, 'fast');
							}
						} else {
							patchConstraintLeft();

							knob2.animate({'left': closest+'px'}, 'fast');
							follow2.animate({'width': followPos+'px'}, 'fast');

							if (isLocked || barDrag){
								knob1.animate({'left': (closest-lockedDiff+knobWidth/2)+'px'}, 'fast');
								follow1.animate({'width': (followPos-lockedDiff)+'px'}, 'fast');
							}
						}
					}
				};

				var eventWindowResize = function(){
					self.sGlideRange('startAt', valueObj[guid]);
					if (markers) drawSnapmarks(true);
				};

				if (isMobile){
					$(document).on(mEvt.down+'.'+guid, function(e){
						// is_down = false;
						touchX = e.originalEvent.touches[0].pageX;
						touchY = e.originalEvent.touches[0].pageY;
					});
				}
				if (isMobile || uAgent.match(/Windows Phone/i)){
					// orientation
					$(window).on('orientationchange.'+guid, eventWindowResize);
				}

				var z = null;
				$(document).on(mEvt.move+'.'+guid, function(e){
					// console.log('>> doc move', is_down);
					if (is_down){
						e = e || event;	// ie fix

						// e.preventDefault();
						// e.stopPropagation();

						var x			= null,
							knobWidth	= knobs.width();

						if (vert){
							var base = self.position().top + self_width;
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
							x += z;
							if (!gotLockedPositions) getLockedPositions();
						}

						var stopper = knobWidth / 2;
						var m = x - stopper;

						// if(event.preventDefault) event.preventDefault();
						if (e.returnValue) e.returnValue = false;

						var targetEl	= target[0],
							knob1El		= knob1[0],
							knob2El		= knob2[0],
							follow1El	= follow1[0],
							follow2El	= follow2[0];

						if (!isLocked && !barDrag){
							if (targetEl === knob1El){
								var knob2_style_left	= knob2El.style.left;
								var knob2_offset_left	= knob2El.offsetLeft;

								if (x <= stopper){
									targetEl.style.left = '0';
									follow1El.style.width = stopper+'px';
								} else if (x >= knob2_offset_left-stopper){
									targetEl.style.left = knob2_style_left;
									follow1El.style.width = (knob2_offset_left-stopper)+'px';
								} else {
									targetEl.style.left = (x-stopper)+'px';
									follow1El.style.width = x+'px';
									if (!snapType || snapType === 'hard') doSnap('drag', m);
								}
							} else if (targetEl === knob2El){
								var knob1_style_left	= knob1El.style.left;
								var knob1_offset_left	= knob1El.offsetLeft;

								if (x <= knob1_offset_left+stopper+knobWidth){
									targetEl.style.left = knob1_style_left;
									follow2El.style.width = (knob1_offset_left+stopper+knobWidth)+'px';
								} else if (x >= self_width-stopper){
									targetEl.style.left = (self_width-knobWidth*2)+'px';
									follow2El.style.width = (self_width-stopper)+'px';
								} else {
									targetEl.style.left = (x-stopper-knobWidth)+'px';
									follow2El.style.width = x+'px';
									if (!snapType || snapType === 'hard') doSnap('drag', m);
								}
							}
						} else {
							if (targetEl === knob1El){
								if (x <= stopper){
									targetEl.style.left = '0';
									follow1El.style.width = stopper+'px';

									knob2El.style.left = (lockedDiff-knobWidth)+'px';
									follow2El.style.width = (lockedDiff+stopper)+'px';
								} else if (x >= self_width-lockedDiff-stopper){
									knob2El.style.left = (self_width-knobWidth*2)+'px';
									follow2El.style.width = (self_width-stopper)+'px';

									targetEl.style.left = (self_width-lockedDiff-knobWidth)+'px';
									follow1El.style.width = (self_width-lockedDiff-stopper)+'px';
								} else {
									targetEl.style.left = (x-stopper)+'px';
									follow1El.style.width = x+'px';

									knob2El.style.left = (x-stopper-knobWidth+lockedDiff)+'px';
									follow2El.style.width = (x+lockedDiff)+'px';
									if (!snapType || snapType === 'hard') doSnap('drag', m);
								}
							} else if (targetEl === knob2El){
								if (x <= lockedDiff+stopper){
									targetEl.style.left = (lockedDiff-knobWidth)+'px';
									follow2El.style.width = (lockedDiff+stopper)+'px';

									knob1El.style.left = '0';
									follow1El.style.width = stopper+'px';
								} else if (x >= self_width-stopper){
									targetEl.style.left = (self_width-knobWidth*2)+'px';
									follow2El.style.width = (self_width-stopper)+'px';

									knob1El.style.left = (self_width-lockedDiff-knobWidth)+'px';
									follow1El.style.width = (self_width-lockedDiff-stopper)+'px';
								} else {
									targetEl.style.left = (x-stopper-knobWidth)+'px';
									follow2El.style.width = x+'px';

									knob1El.style.left = (x-stopper-lockedDiff)+'px';
									follow1El.style.width = (x-lockedDiff)+'px';
									if (!snapType || snapType === 'hard') doSnap('drag', m);
								}
							}
						}

						// results
						setResults();

						var state = self.data('state');

						// update values
						if (options.drag && state === 'active')
							options.drag(updateME(getPercent([result_from, result_to])));
					}
				}).on(mEvt.up+'.'+guid, function(e){
					var state = self.data('state');
					is_down = false;
					barDrag = false;
					gotLockedPositions = false;
					z = null;
					if (state === 'active'){
						if (snapType === 'hard'){
							self.data('state', 'inactive');
							return false;
						}
						e = e || event;	// ie fix
						var x = null, base = 0;

						if (vert){
							base = self.position().top + self_width;
							x = base - ((!isMobile ? e.pageY : touchY)-2);
						} else x = (!isMobile ? e.pageX : touchX) - self.offset().left;
						
						var knobWidth	= knobs.width();
						var stopper		= knobWidth / 2;
						var m			= x - stopper;	// true position of knob

						// snap to
						if (snaps > 0 && snaps < 10 && (snapType === 'soft' || snapType === 'hard')){
							if (target[0] === knob1[0] && m <= knob2[0].offsetLeft)
								result_from = doSnap((snapType === 'hard') ? 'hard' : 'soft', m);
							else if (target[0] === knob2[0] && m >= knob1[0].offsetLeft)
								result_to = doSnap((snapType === 'hard') ? 'hard' : 'soft', m);
						}

						if (options.drop) options.drop(updateME(getPercent([result_from, result_to])));
						if (options.drag && state === 'active') options.drag(updateME(getPercent([result_from, result_to])));
						self.data('state', 'inactive');
					}
				});

				//------------------------------------------------------------------------------------------------------------------------------------
				// functions

				var setResults = function(){
					// console.log('>> setResults', knob2[0].style.left, knob2[0].offsetLeft - knob2.width());
					/*result_from	= knob1[0].style.left || '0';
					result_from	= result_from.replace('px', '');
					result_to	= knob2[0].style.left || '0';
					result_to	= result_to.replace('px', '');*/
					result_from	= knob1[0].offsetLeft || 0;
					result_to	= (knob2[0].offsetLeft - knob2.width()) || 0;
				};

				// set locked positions
				var lockedKnob1Pos		= null,
					lockedKnob2Pos		= null,
					lockedDiff			= null,
					gotLockedPositions	= false,
					getLockedPositions	= function(){
						// lockedKnob1Pos	= parseFloat(knob1[0].style.left.replace('px', ''), 10);// + knob_width_css;
						// lockedKnob2Pos	= parseFloat(knob2[0].style.left.replace('px', ''), 10) + knob2.width();
						lockedKnob1Pos	= knob1[0].offsetLeft;
						lockedKnob2Pos	= knob2[0].offsetLeft;
						lockedDiff		= lockedKnob2Pos - lockedKnob1Pos;
						gotLockedPositions = true;
					};

				if (customRange){
					var cstmStart = settings.totalRange[0];
					var diff = settings.totalRange[1] - cstmStart;
				}
				var sendData = {};
				var getPercent = function(arr){
					var o = null, pcts = [], cstm = [], p = 0;

					for (var i = 0; i < arr.length; i++){
						// o = parseFloat(arr[i], 10);
						o = arr[i] | 0;
						// calculate percentage
						p = o / (self_width - (knob1.width() * 2)) * 100;
						pcts.push(p);
						if (customRange) cstm.push(diff * p / 100 + cstmStart);
					}

					// set data to send
					sendData.percentRange = pcts;
					if (customRange) sendData.customRange = cstm;

					valueObj[guid] = pcts;
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
					var num = valueObj[guid];

					self.sGlideRange('startAt', num);
					setResults();

					var rlt = updateME(getPercent([result_from, result_to]));
					
					// inits
					if (snaps > 0 && snaps < 10)	drawSnapmarks();
					if (vert)						verticalTransform();
					if (options.onload)				options.onload(rlt);
					if (isLocked)					getLockedPositions();

					$(el).off('makeready.'+guid, setStartAt);
				};

				// Listen for image loaded
				var eventMakeReady = $.Event('makeready.'+guid);
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