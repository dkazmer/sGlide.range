/*global window:false, console:false, document:false, event:false, jQuery:false */

/***********************************************************************************

author:		Daniel Kazmer - http://iframework.net
created:	1.11.2014
version:	1.0.0

	version history:
		1.0.0:	created - born of sGlide

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
				hard		: false,
				onlyOnDrop	: false,
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
		- if unit is %, then markers should be also
		- fix bug: rebuilding vertical rotates again

***********************************************************************************/

(function($){
	var valueObj	= {};
	var helpers		= {
		/*'isMobile'	: false,
		'buttons'	: false*/
	};
	var methods		= {
		destroy: function(){
			this.each(function(i, el){
				var self	= $(el);
				var id		= self.selector;
				var guid	= self.attr('id');

				// unwrap vertical
				var vertContainer = $('#'+guid+'_vert-marks');
				if (vertContainer[0]) self.unwrap();

				// unwrap buttons marks
				else {
					var buttonsContainer = $('#'+guid+'_button-marks');
					if (buttonsContainer[0]) self.unwrap();
				}

				// remove buttons
				if ($('#'+guid+'_plus')[0]) $('#'+guid+'_minus, #'+guid+'_plus').remove();

				var markers = $('#'+guid+'_markers');
				if (markers.length > 0) markers.remove();

				var mEvt = {
					'down'	: 'mousedown',
					'up'	: 'mouseup',
					'move'	: 'mousemove'
				};

				if (helpers[guid+'-isMobile']){
					mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
				// windows phone touch events
				} else if (window.navigator.msPointerEnabled){
					$(document).off(mEvt.msup, eventDocumentMouseUp);
					$(document).off(mEvt.msmove, eventDocumentMouseMove);
					self.off(mEvt.msdown, eventBarMouseDown);
					self.children('.follow_bar').off(mEvt.msdown, eventBarMouseDown);
					self.children('.slider_knob').off(mEvt.msdown, eventKnobMouseDown).off(mEvt.msup, eventKnobMouseDown);
				} else
					$(document).off('keydown.'+guid).off('keyup.'+guid);

				if (helpers[guid+'-buttons']){
					$('#'+guid+'_plus').off(mEvt.down).off(mEvt.up);
					$('#'+guid+'_minus').off(mEvt.down).off(mEvt.up);
				}
				
				$(document).off(mEvt.move+'.'+guid).off(mEvt.up+'.'+guid);
				$(window).off('orientationchange.'+guid);
				self.off(mEvt.down);
				self.children('.slider_knob').off(mEvt.up).off(mEvt.down).remove();
				self.children('.follow_bar').off(mEvt.down).remove();
				self.removeAttr('style');
			});
		},
		startAt: function(pct, animated){
			this.each(function(i, el){
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
						'hard'		: false,
						'onlyOnDrop': false,
						'points'	: 0
					},
					'disabled'		: false,
					// 'colorShift'	: [],
					'vertical'		: false,
					// 'showKnob'		: true,
					// 'buttons'		: false,
					'totalRange'	: [0,0],
					'locked'		: false,
					'retina'		: true
				}, options);

				self.removeAttr('style');	// remove user inline styles

				helpers[guid+'-isMobile'] = false;
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
					helpers[guid+'-isMobile'] = true;
					mEvt.down = 'touchstart'; mEvt.up = 'touchend'; mEvt.move = 'touchmove';
					if (window.navigator.msPointerEnabled){
						mEvt.down = 'MSPointerDown'; mEvt.up = 'MSPointerUp'; mEvt.move = 'MSPointerMove';
					}
					var touchX = null, touchY = null;
				} else if (uAgent.match(/Windows Phone/i)){
					if (window.navigator.msPointerEnabled){
						self.css({'-ms-touch-action': 'none'});
						mEvt.msdown = 'MSPointerDown'; mEvt.msup = 'MSPointerUp'; mEvt.msmove = 'MSPointerMove';
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
					knob_bg			= '#333',
					knob_width		= (!settings.disabled ? '2%' : '0'),
					knob_height		= 'inherit',
					self_height		= Math.round(settings.height)+'px',
					r_corners		= settings.pill,
					imageBln		= (settings.image != 'none' && settings.image !== '' && !settings.disabled),
					imgLoaded		= false,
					resize			= false,
					// keyCtrl			= (self.attr('data-keys') == 'true') ? true : false,
					// keyCtrlShift	= (self.attr('data-keys') == 'shift') ? true : false,
					// colorChangeBln	= (settings.colorShift.length > 1) ? true : false,
					isMobile		= helpers[guid+'-isMobile'],
					retina			= (window.devicePixelRatio > 1) && settings.retina
					customRange		= (settings.totalRange[0] !== 0 || settings.totalRange[1] !== 0) && settings.totalRange[0] < settings.totalRange[1],
					isLocked		= settings.locked;

				helpers[guid+'-buttons'] = settings.buttons;

				//------------------------------------------------------------------------------------------------------------------------------------
				// image handling

				if (imageBln){	// if image
					img = settings.image;

					// string ir array
					var multiImageBln = false;
					if (img instanceof Array){
						multiImageBln = true;
					}

					// retina handling
					/*if (retina){
						var rImgTemp = img.split('.');
						var rImgTemp_length = rImgTemp.length;

						rImgTemp[rImgTemp_length-2] = rImgTemp[rImgTemp_length-2] + '@2x';
						img = '';
						for (var i = 0; i < rImgTemp_length; i++){
							img += rImgTemp[i] + ((i < rImgTemp_length-1) ? '.' : '');
						}
					}*/

					if (multiImageBln){
						knobs.html('<img src="" style="visibility:hidden; position:absolute" />');
						var newImage = new Image();
						var multiImageIndex = 0;
						var loadNextImage = function(el){
							newImage = el.find('img');
							newImage.attr('src', img[multiImageIndex]).load(function(){



								if (retina){
									newImage[0].style.width = (newImage[0].offsetWidth / 2) + 'px';
									// newImage.style.height = (newImage.offsetHeight / 2) + 'px';
								}

								var thisHeight = newImage[0].naturalHeight;
								knob_width = newImage[0].naturalWidth+'px';
								knob_height = thisHeight+'px';

								knob_bg = 'url('+img[multiImageIndex]+') no-repeat';
								var knob_bg_styles = {
									'width': knob_width,
									'height': knob_height,
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
										'height': knob_height,
										'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0px'
									});
									self.css({
										'height': knob_height,
										'border-radius': r_corners ? thisHeight / 2 + 'px' : '0px'
									});

									imgLoaded = true;

									if (thisHeight > settings.height){
										var knobMarginValue = 0;
										knobMarginValue = (thisHeight-settings.height)/2;
										self.css('height', settings.height+'px');
										knobs.css('top', '-'+knobMarginValue+'px');
										follows.css({
											'height': settings.height+'px',
											'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0px'
										});
									} else {
										// children stay inside parent
										self.css('overflow', 'hidden');

										// adjust color shifter height
										follows.find('div').css('height', knob_height);
									}
								}


							});
						};
						loadNextImage(knob1);
					} else {
						knobs.html('<img src="'+img+'" style="visibility:hidden; position:absolute" />');
					
						knobs.children('img').load(function(){
							imgLoaded = true;

							var imgEl = $(this);

							if (retina){
								imgEl[0].style.width = (imgEl[0].offsetWidth / 2) + 'px';
								// imgEl.style.height = (imgEl.offsetHeight / 2) + 'px';
							}

							// knobs.css('width', 'auto');
							var thisHeight = imgEl[0].naturalHeight;
							knob_width = imgEl[0].naturalWidth+'px';
							knob_height = thisHeight+'px';

							knob_bg = 'url('+img+') no-repeat';
							var knob_bg_styles = {
								'width': knob_width,
								'height': knob_height,
								'background': knob_bg
							};
							if (retina) knob_bg_styles['background-size'] = '100%';

							knobs.css(knob_bg_styles);
							follows.css({
								'height': knob_height,
								'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0px'
							});
							self.css({
								'height': knob_height,
								'border-radius': r_corners ? thisHeight / 2 + 'px' : '0px'
							});

							imgEl.remove();

							if (thisHeight > settings.height){
								var knobMarginValue = 0;
								knobMarginValue = (thisHeight-settings.height)/2;
								self.css('height', settings.height+'px');
								knobs.css('top', '-'+knobMarginValue+'px');
								follows.css({
									'height': settings.height+'px',
									'border-radius': r_corners ? thisHeight / 2 + 'px 0 0 ' + thisHeight / 2 + 'px' : '0px'
								});
							} else {
								// children stay inside parent
								self.css('overflow', 'hidden');

								// adjust color shifter height
								follows.find('div').css('height', knob_height);
							}
						});
					}
				} else {
					imgLoaded = true;
					var d = settings.height / 2;
					self.css({'border-radius': (r_corners ? d+'px' : '0'), 'overflow': 'hidden'});
					follows.css('border-radius', (r_corners ? d+'px 0 0 '+d+'px' : '0'));
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
					'cursor': 'default',
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
					'width': knob_width,
					'background': knob_bg,
					'height': knob_height,
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

				//------------------------------------------------------------------------------------------------------------------------------------
				// snap marks, buttons, vertical

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
						if (!resize){
							self.after('<div id="'+guid+'_markers"></div>');
							
							var marks = $('#'+guid+'_markers');
							
							marks.css({
								'width': self_width+'px', //settings.width + unit,
								'margin': 'auto',
								'padding-left': (kw/2)+'px',
								'-webkit-touch-callout': 'none',
								'box-sizing': 'border-box'
							}).css(cssUserSelect);
						} else {
							var marks = $('#'+guid+'_markers');
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
				};

				// -----------

				// buttons
				/*var drawButtons = function(){
					knob_adjust = knobs.width() / self_width * 50;

					var vertStyles	= '; z-index:1000; position:relative; top:30px',
						plusStr		= '<div class="sglide-buttons" id="'+guid+'_plus" style="display:inline-block; cursor:pointer'+(vert ? vertStyles : '')+'">&nbsp;+&nbsp;</div>',
						minusStr	= '<div class="sglide-buttons" id="'+guid+'_minus" style="display:inline-block; cursor:pointer'+(vert ? vertStyles : '')+'">&nbsp;&minus;&nbsp;</div>';

					if (markers){
						if (!vert){
							self.css('width', 'auto');
							var a = (vert) ? $('#'+guid+'_vert-marks') : $('#'+guid+', #'+guid+'_markers');
							a.wrapAll('<div id="'+guid+'_button-marks" style="display:inline-block; vertical-align:middle; width:'+width+unit+'"></div>');
							var q = $('#'+guid+'_button-marks');
						} else {
							var q = $('#'+guid+'_vert-marks');
						}

						q.after(plusStr);
						q.before(minusStr);
					} else {
						self.css({
							'display': (!vert) ? 'inline-block' : 'block',
							'vertical-align': 'middle'
						});

						self.after(plusStr);
						self.before(minusStr);
					}

					var plusBtn		= $('#'+guid+'_plus'),
						minusBtn	= $('#'+guid+'_minus');

					minusBtn.css(cssUserSelect);
					plusBtn.css(cssUserSelect);

					if (!settings.disabled){
						plusBtn.on(mEvt.down, function(){
							btn_is_down = true;
							btnTriggers('>');
							btn_timers = setTimeout(function(){
								btnHold('>');
							}, 500);
						}).on(mEvt.up, btnClearAction);

						minusBtn.on(mEvt.down, function(){
							btn_is_down = true;
							btnTriggers('<');
							btn_timers = setTimeout(function(){
								btnHold('<');
							}, 500);
						}).on(mEvt.up, btnClearAction);
					}
				}, btnTriggers = function(direction, smoothBln){
					var knobWidth = knobs.width();
					var set_value = THE_VALUE = valueObj[guid];
					if (btn_snap){
						var intvl = 100 / (settings.snap.points - 1);
						var p = intvl;
						for (var i = 0; i < settings.snap.points; i++){
							if (intvl >= THE_VALUE){
								if (direction == '>')	THE_VALUE = (Math.round(intvl) > Math.round(THE_VALUE) ? intvl : intvl+p);
								else					THE_VALUE = intvl-p;
								break;
							} else intvl += p;
						}
					} else {
						if (direction == '>')	THE_VALUE+=(smoothBln ? 1 : 10);
						else					THE_VALUE-=(smoothBln ? 1 : 10);
					}

					set_value = THE_VALUE;	// leave THE_VALUE out of visual adjustments

					// constraints
					if ((THE_VALUE+knob_adjust) > 100)	{ THE_VALUE = 100; set_value = 100; }
					else if (THE_VALUE-knob_adjust < 0)	{ THE_VALUE = 0; set_value = 0; }

					// set pixel positions
					var px = (self_width - knobWidth) * set_value / 100 + (knobWidth / 2);
					var pxAdjust = px - knobWidth / 2;

					// gui
					knobs.css('left', pxAdjust+'px');
					follows.css('width', px+'px');
					if (colorChangeBln) colorChange(set_value);

					// output
					if (options.onButton) options.onButton({'id':guid, 'value':THE_VALUE, 'el':self});
					valueObj[guid] = THE_VALUE;
				}, btnHold = function(dir){
					var btnHold_timer = setInterval(function(){
						if (btn_is_down) btnTriggers(dir, (btn_snap ? false : true));
						else clearInterval(btnHold_timer);
					}, (btn_snap ? 201 : 10));
				}, btnClearAction = function(){
					btn_is_down = false;
					clearTimeout(btn_timers);
				}, knob_adjust = 0, btn_is_down = false, btn_timers = null;
				var btn_snap = (settings.snap.points > 0 && settings.snap.points <= 9 && (settings.snap.hard || settings.snap.onlyOnDrop));*/

				//------------------------------------------------------------------------------------------------------------------------------------
				// events

				// knob
				var is_down	= false;
				var target	= null;

				knobs.on(mEvt.down, function(e){
					target = $(e.target);
					is_down = true;
					self.data('state', 'active');
				}).on(mEvt.up, function(){
					is_down = false;
				});

				// snapping
				var storedSnapValues = ['a-1', 'b-1'];
				var doSnap = function(kind, m){
					if (snaps > 0 && snaps < 10){	// min 1, max 9
						var knobWidth = target.width()*2;
						// var pctFive = self_width / 20 + 10;
						var pctFive = self_width * (10-snaps) / 100 - 2 + snaps-snaps/2;

						// % to px
						var snapPixelValues = [];
						for (var i = 0; i < snapPctValues.length; i++){
							snapPixelValues.push((self_width - knobWidth) * snapPctValues[i] / 100);
							// snapPixelValues.push(snapValues[i] - knobWidth*i);
						}

						// get closest px mark, and set %
						var closest = null, pctVal = 0;
						$.each(snapPixelValues, function(i){
							if (closest === null || Math.abs(this - m) < Math.abs(closest - m)){
								closest = this;
								pctVal = snapPctValues[i];
							}
						});

						// physically snap it
						if (kind == 'drag'){
							if (settings.snap.hard){
								updateSnap(closest, knobWidth);

								if (target[0] === knob1[0]){
									// updateSnap(knob1, follow1, closest, (closest+knobWidth/4));
									doOnSnap(closest, pctVal, 'from');
								} else {
									// updateSnap(knob2, follow2, closest, (closest+knobWidth/4+knobWidth/2));
									doOnSnap(closest, pctVal, 'to');
								}
							} else {
								if (Math.round(Math.abs(closest - m + target.width()/2)) < pctFive){
									updateSnap(closest, knobWidth);

									if (target[0] === knob1[0]){
										// updateSnap(knob1, follow1, closest, (closest+knobWidth/4));
										doOnSnap(closest, pctVal, 'from');
									} else {
										// updateSnap(knob2, follow2, closest, (closest+knobWidth/4+knobWidth/2));
										doOnSnap(closest, pctVal, 'to');
									}
								} else storedSnapValues = ['a-1', 'b-1'];
							}
						} else if (kind == 'hard'){
							// if (target[0] === knob1[0])	updateSnap(knob1, follow1, closest, (closest+knobWidth/4));
							// else						updateSnap(knob2, follow2, closest, (closest+knobWidth/4+knobWidth/2));

							updateSnap(closest, knobWidth);
							return closest;
						} else {
							// if (target[0] === knob1[0])	updateSnap(knob1, follow1, closest, (closest+knobWidth/4), true);
							// else						updateSnap(knob2, follow2, closest, (closest+knobWidth/4+knobWidth/2), true);
							updateSnap(closest, knobWidth, true)
							return closest;
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
							snapObj = updateME(getPercent((storedSnapValues[0].indexOf('-1') !== -1) ? valueObj[guid][0] : storedSnapValues[0], b));
						else
							snapObj = updateME(getPercent(b, (storedSnapValues[1].indexOf('-1') !== -1) ? valueObj[guid][1] : storedSnapValues[1]));

						options.onSnap(snapObj);
					}
				// }, updateSnap = function(knb, fllw, knobPos, followPos, animateBln){
				}, updateSnap = function(closest, knobWidth, animateBln){
					var followPos = (closest+knobWidth/4+knobWidth/2);

					if (!animateBln){
						if (target[0] === knob1[0]){
							knob1[0].style.left		= closest+'px';
							follow1[0].style.width	= (closest+knobWidth/4)+'px';

							if (isLocked){
								knob2[0].style.left		= (closest+lockedDiff-knobWidth/2)+'px';
								follow2[0].style.width	= (closest+knobWidth/4+lockedDiff)+'px';
							}
						} else {
							knob2[0].style.left		= closest+'px';
							follow2[0].style.width	= followPos+'px';

							if (isLocked){
								knob1[0].style.left		= (closest-lockedDiff+knobWidth/2)+'px';
								follow1[0].style.width	= (followPos-lockedDiff)+'px';
							}
						}
					} else {
						if (target[0] === knob1[0]){
							knob1.animate({'left': knobPos+'px'}, 'fast');
							follow1.animate({'width': (closest+knobWidth/4)+'px'}, 'fast');
						} else {
							knob2.animate({'left': knobPos+'px'}, 'fast');
							follow2.animate({'width': followPos+'px'}, 'fast');
						}
					}
				};

				var eventWindowResize = function(){
					self.sGlideRange('startAt', valueObj[guid]);
					if (markers) drawSnapmarks(true);
				};

				/*if (!isMobile && (keyCtrl || keyCtrlShift)){
					var keycode, keydown = false,
						codeBack	= (vert) ? 40 : 37,
						codeFwd		= (vert) ? 38 : 39;

					$(document).on('keydown.'+guid, function(e){
						if (!keydown && !settings.disabled){
							if (window.event){
								keycode = window.event.keyCode;
								if (keyCtrlShift && !window.event.shiftKey) return false;
							} else if (e){
								keycode = e.which;
								if (keyCtrlShift && !e.shiftKey) return false;
							}

							if (keycode == codeBack){
								btn_is_down = true;
								btnTriggers('<');
								btn_timers = setTimeout(function(){
									btnHold('<');
								}, 500);
								keydown = true;
							} else if (keycode == codeFwd){
								btn_is_down = true;
								btnTriggers('>');
								btn_timers = setTimeout(function(){
									btnHold('>');
								}, 500);
								keydown = true;
							}
						}
					}).on('keyup.'+guid, function(){
						keydown = false;
						btnClearAction();
					});
				}*/

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

				$(document).on(mEvt.move+'.'+guid, function(e){
					if (!is_down) return false;

					e = e || event;	// ie fix

					// e.stopPropagation();
					// e.preventDefault();

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

					var stopper = knobWidth / 2;
					var m = x - stopper;

					// if(event.preventDefault) event.preventDefault();
					if (e.returnValue) e.returnValue = false;

					// constraint & position
					/*if (x <= stopper && target[0] === knob1[0]){
						target.css('left', '0px');
						follows.css('width', stopper+'px');
					} else if (x >= self_width-stopper && target[0] === knob2[0]){
						target.css('left', (self_width-knobWidth)+'px');
						follows.css('width', (self_width-stopper)+'px');
					} else {
						target.css('left', (x-stopper)+'px');
						follows.css('width', x+'px');
						if (!settings.snap.onlyOnDrop) doSnap('drag', m);
					}*/
				if (!isLocked){
					if (target[0] === knob1[0]){
						var knob2_style_left	= knob2[0].style.left;
						var knob2_offset_left	= knob2[0].offsetLeft;

						if (x <= stopper){
							target.css('left', '0px');
							follow1.css('width', stopper+'px');
						} else if (x >= knob2_offset_left-stopper){
							target.css('left', knob2_style_left);
							follow1.css('width', (knob2_offset_left-stopper)+'px');
						} else {
							target.css('left', (x-stopper)+'px');
							follow1.css('width', x+'px');
							if (!settings.snap.onlyOnDrop) doSnap('drag', m);
						}
					} else if (target[0] === knob2[0]){
						var knob1_style_left	= knob1[0].style.left;
						var knob1_offset_left	= knob1[0].offsetLeft;

						if (x <= knob1_offset_left+stopper+knobWidth){
							target.css('left', knob1_style_left);
							follow2.css('width', (knob1_offset_left+stopper+knobWidth)+'px');
						} else if (x >= self_width-stopper){
							target.css('left', (self_width-knobWidth*2)+'px');
							follow2.css('width', (self_width-stopper)+'px');
						} else {
							target.css('left', (x-stopper-knobWidth)+'px');
							follow2.css('width', x+'px');
							if (!settings.snap.onlyOnDrop) doSnap('drag', m);
						}
					}
				} else {
					var knob2_style_left	= knob2[0].style.left;
					var knob2_offset_left	= knob2[0].offsetLeft;
					
					var knob1_style_left	= knob1[0].style.left;
					var knob1_offset_left	= knob1[0].offsetLeft;

					if (target[0] === knob1[0]){
						if (x <= stopper){
							target.css('left', '0px');
							follow1.css('width', stopper+'px');

							knob2.css('left', (lockedDiff-knobWidth)+'px');
							follow2.css('width', (lockedDiff+stopper)+'px');
						} else if (x >= self_width-lockedDiff-stopper){
							knob2.css('left', (self_width-knobWidth*2)+'px');
							follow2.css('width', (self_width-stopper)+'px');

							target.css('left', (self_width-lockedDiff-knobWidth)+'px');
							follow1.css('width', (self_width-lockedDiff-stopper)+'px');
						} else {
							target.css('left', (x-stopper)+'px');
							follow1.css('width', x+'px');

							knob2.css('left', (x-stopper-knobWidth+lockedDiff)+'px');
							follow2.css('width', (x+lockedDiff)+'px');
							if (!settings.snap.onlyOnDrop) doSnap('drag', m);
						}
					} else if (target[0] === knob2[0]){
						if (x <= lockedDiff+stopper){
							target.css('left', (lockedDiff-knobWidth)+'px');
							follow2.css('width', (lockedDiff+stopper)+'px');

							knob1.css('left', '0px');
							follow1.css('width', stopper+'px');
						} else if (x >= self_width-stopper){
							target.css('left', (self_width-knobWidth*2)+'px');
							follow2.css('width', (self_width-stopper)+'px');

							knob1.css('left', (self_width-lockedDiff-knobWidth)+'px');
							follow1.css('width', (self_width-lockedDiff-stopper)+'px');
						} else {
							target.css('left', (x-stopper-knobWidth)+'px');
							follow2.css('width', x+'px');

							knob1.css('left', (x-stopper-lockedDiff)+'px');
							follow1.css('width', (x-lockedDiff)+'px');
							if (!settings.snap.onlyOnDrop) doSnap('drag', m);
						}
					}
				}

					// results
					/*result_from	= knob1[0].style.left || '0px';
					result_from	= result_from.replace('px', '');
					result_to	= knob2[0].style.left || '0px';
					result_to	= result_to.replace('px', '');*/
					setResults();

					var state = self.data('state');

					// update values
					if (options.drag && state == 'active')
						options.drag(updateME(getPercent(result_from, result_to)));

					// color change
					// if (colorChangeBln && state == 'active')
					// 	colorChange(getPercent(result_from, result_to));
				}).on(mEvt.up+'.'+guid, function(e){
					var state = self.data('state');
					is_down = false;
					if (state == 'active'){
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
						if (snaps > 0 && snaps < 10 && (settings.snap.onlyOnDrop || settings.snap.hard)){
							if (target[0] === knob1[0] && m <= knob2[0].offsetLeft)
								result_from = doSnap((settings.snap.hard) ? 'hard' : 'drop', m);
							else if (target[0] === knob2[0] && m >= knob1[0].offsetLeft)
								result_to = doSnap((settings.snap.hard) ? 'hard' : 'drop', m);
						} //else {
							// var mm	= knobs.offset().left,	// odd behaviour on vertical
							/*var mm	= knobs[0].offsetLeft,
								mq	= self_width - knobWidth;

							// constraint
							if (mm <= 0){
								knobs.css('left', '0px');
								follows.css('width', stopper+'px');
							} else if (mm >= mq){
								knobs.css('left', mq+'px');
								follows.css('width', (self_width-stopper)+'px');
							}*/

							/*result_from	= knob1[0].style.left || '0px';
							result_from	= result_from.replace('px', '');
							result_to	= knob2[0].style.left || '0px';
							result_to	= result_to.replace('px', '');*/
						// 	setResults();
						// }

						if (options.drop) options.drop(updateME(getPercent(result_from, result_to)));
						if (options.drag && state == 'active') options.drag(updateME(getPercent(result_from, result_to)));
						self.data('state', 'inactive');

						// color change
						// if (colorChangeBln) colorChange(getPercent(result));
					}

					// if button pressed but released off button, clear button action
					// if (btn_is_down) btnClearAction();
				});

				var setResults = function(){
					result_from	= knob1[0].style.left || '0px';
					result_from	= result_from.replace('px', '');
					result_to	= knob2[0].style.left || '0px';
					result_to	= result_to.replace('px', '');
				};

				//------------------------------------------------------------------------------------------------------------------------------------
				// functions

				// locked
				if (isLocked){
					var lockedKnob1Pos = null,
						lockedKnob2Pos = null,
						lockedDiff = null,
						getLockedPositions = function(){
						lockedKnob1Pos = parseFloat(knob1[0].style.left.replace('px', ''), 10);// + knob_width;
						lockedKnob2Pos = parseFloat(knob2[0].style.left.replace('px', ''), 10) + knobs.width();
						lockedDiff = lockedKnob2Pos - lockedKnob1Pos;
					};
				}

				/*var getPercent = function(a, b){
					var o = null, pcts = [];
					valueObj[guid] = [];

					for (var i = 0; i < getPercent.arguments.length; i++){
						o = parseFloat(getPercent.arguments[i], 10);
						// calculate percentage
						pcts.push(o / (self_width - (target.width() * 2)) * 100);
					}

					valueObj[guid] = pcts;
					return pcts;
				};*/

				if (customRange){
					var cstmStart = settings.totalRange[0];
					var diff = settings.totalRange[1] - cstmStart;
				}
				var sendData = {'percentRange': null};
				var getPercent = function(a, b){
					var o = null, pcts = [], cstm = [], p = 0;
					valueObj[guid] = [];

					for (var i = 0; i < getPercent.arguments.length; i++){
						o = parseFloat(getPercent.arguments[i], 10);
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
					// if (self.data('state') == 'active'){
						o.id = guid;
						o.el = self;
						return o;
						// return {'id':guid, 'from':o[0], 'to': o[1], 'el':self};
					// }
				};

				// color change
				/*var colorShiftInit = function(){
					var selfHeightHalf = self.offsetHeight / 2;
					var borderRadius = 'border-radius: '+(r_corners ? selfHeightHalf + 'px 0 0 ' + selfHeightHalf + 'px' : '0px');
					follows.css({
						'overflow': 'hidden',
						'background-color': settings.colorShift[0]
					});

					follows.html('<div style="opacity:'+(settings.startAt/100)+'; height:100%; background-color:'+settings.colorShift[1]+'; "></div>');
				}
				var colorChange = function(o){
					// follows.find('div').css('opacity', ''+(o/100));
					follow[0].childNodes[0].style.opacity = o / 100;
				};

				// bar
				var eventBarMouseDown = function(e){
					e = e || event;	// ie fix
					e.stopPropagation();
					e.preventDefault();
					if (e.returnValue) e.returnValue = false;	// wp

					is_down = true;
					self.data('state', 'active');

					if (!isMobile && !settings.snap.onlyOnDrop){
						var x = null;
						if (vert){
							var base = self.position().top + self.width();
							x = base - (e.pageY-2);
						} else x = e.pageX - self.offset().left;
						var m = x - (knobs.width() / 2);	// true position of knob

						knobs.css('left', m+'px');
						follows.css('width', m+(knobs.width()/2)+'px');
						
						// constraint
						if (m < 0) knobs.css('left', '0px');
						else if (m >= self.width()-knobs.width()) knobs.css('left', self.width()-knobs.width()+'px');
					}
				};

				if (!settings.disabled){
					self.on(mEvt.down, eventBarMouseDown);
					follows.on(mEvt.down, eventBarMouseDown);
				}*/

				//------------------------------------------------------------------------------------------------------------------------------------
				// start

				var setStartAt = function(num){
					startAt = (num) ? num : settings.startAt;

					self.sGlideRange('startAt', startAt);

					setResults();

					var rlt = updateME(getPercent(result_from, result_to));
					
					if (options.drop) options.drop(rlt);
					if (options.drag) options.drag(rlt);

					// inits
					if (snaps > 0 && snaps < 10) drawSnapmarks();
					if (vert) verticalTransform();
					// if (helpers[guid+'-buttons']) drawButtons();
					/*if (colorChangeBln){
						colorShiftInit();
						colorChange(startAt);
					}*/
					if (isLocked) getLockedPositions();
				};

				var onload_timer = setInterval(function(){
					if (imgLoaded){
						clearInterval(onload_timer);
						setStartAt(valueObj[guid]);
						if (options.onload) options.onload();
					}
				}, 1);
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