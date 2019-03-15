# sGlide.range

A derivative of sGlide. Select the range between custom min and max numbers. Returns selected range numbers and corresponding percentage values. Uses optional smart snapping. Apply your own styles.

For details, visit [home page](https://webshifted.com/sGlide.range/).

Quickstart Guide: apply the following to an empty `div` with a unique id.

```js
const callback = o => {};

let options = {
	startAt: [20, 60],	// percentages of totalRange
	width: 90,
	height: 20,
	totalRange: [58, 102],
	snap: {
		points: 5,
		marks: true
	},
	drop: callback,
	onSnap: callback
};

// Standalone
let sGr_instance = new sGlideRange(el, options);

// or jQuery
$('#slider').sGlideRange(options);
```