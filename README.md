sGlide.range
============

A derivative of sGlide. Select the range between custom min and max numbers. Returns selected range numbers and percentage values. Uses optional smart snapping. Apply your own CSS.

Quickstart Guide: apply the following to an empty DIV with a unique id.

	// jQuery:
	// $('#slider').sGlide({
	// jQuery independent:
	var my_sGlide_instance = new sGlide(my_element, {
		startAt: [20, 60],	// percentages of totalRange
		width: 600,
		height: 20,
		unit: 'px',
		totalRange: [58, 102],
		snap: {
			points: 5,
			marks: true
		},
		drop: function(o){
			// 'o' Object returned
		}
	});