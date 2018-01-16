sGlide.range
============

A derivative of sGlide. Select the range between custom min and max numbers. Returns selected range numbers and corresponding percentage values. Uses optional smart snapping. Apply your own CSS.

For details, visit http://webshifted.com/sGlide.range/

Quickstart Guide: apply the following to an empty DIV with a unique id.

	var callback = o => {};
	var options = {
		startAt: [20, 60],	// percentages of totalRange
		width: 80,		// % of parent node (default)
		totalRange: [58, 102],
		snap: {
			points: 5,
			marks: true
		},
		drop: callback
	};
	
	// Standalone
	var sGlide_instance = new sGlideRange(el, options);
	// or jQuery
	$('#slider').sGlideRange(options);
