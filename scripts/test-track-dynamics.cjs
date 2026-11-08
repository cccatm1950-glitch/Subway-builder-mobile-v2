const assert=require('node:assert/strict');
const d=require('../app/src/main/assets/track-dynamics.js');
assert.equal(d.calculateTurnRadius({x:0,y:0},{x:10,y:0},{x:20,y:0}),null);
const r=d.calculateTurnRadius({x:0,y:0},{x:10,y:0},{x:10,y:10});
assert.ok(Math.abs(r-10)<1e-8);
assert.ok(d.calculateTurnRadius({x:0,y:0},{x:10,y:0},{x:10,y:10},{cubic:true})>r);
assert.equal(d.calculateTurnRadius({x:0,y:0},{x:0,y:0},{x:10,y:10}),null);
const radii=d.calculateSmoothedTrackRadii([{x:0,y:0},{x:10,y:0},{x:20,y:0},{x:25,y:5},{x:25,y:15},{x:25,y:25}]);
assert.equal(radii.length,4);assert.ok(radii.some(Number.isFinite));
assert.equal(d.getMaxSpeedForSlope(100,6),90);assert.equal(d.getMaxSpeedForSlope(100,8),75);assert.equal(d.getMaxSpeedForSlope(100,9.5),60);
assert.equal(d.getMaxSpeedForSlope(100,-9.5),100); // downhill grade does not receive an uphill penalty
assert.equal(d.getMaxSpeedForRadiusAndSlope({maxSpeedKmh:100,radiusMeters:1000}),100);
assert.ok(d.getMaxSpeedForRadiusAndSlope({maxSpeedKmh:100,radiusMeters:20})<100);
assert.ok(d.getMaxSpeedForRadiusAndSlope({maxSpeedKmh:100,radiusMeters:100,minTurnRadiusMeters:29})>d.getMaxSpeedForRadiusAndSlope({maxSpeedKmh:100,radiusMeters:20,minTurnRadiusMeters:29}));
assert.equal(d.getMaxSpeedForRadiusAndSlope({maxSpeedKmh:100,radiusMeters:1000,stationTrack:true}),50);
assert.equal(d.getSpeedBand(49),'moderate');assert.equal(d.getSpeedBand(130),'high-speed');
const analysis=d.analyzeTrack([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:20,y:10}],{
 minTurnRadiusMeters:29,maxLateralAcceleration:1,maxSpeedKmh:88.992,
 curveSpeedMultiplier:.99,slopePercent:0,smoothingRadius:2
});
assert.equal(analysis.length,2);
assert.equal(analysis[0].pointIndex,1);
assert.ok(analysis[0].radiusMeters>=29);
assert.ok(analysis[0].speedKmh>0&&analysis[0].speedKmh<25);
assert.equal(analysis[0].speedBand,'slow');
assert.equal(d.getMaxSpeedForSlope(100,4,{low:3.3,medium:4.4,high:5.225}),90);
assert.equal(d.getMaxSpeedForSlope(100,4.5,{low:3.3,medium:4.4,high:5.225}),75);
assert.equal(d.getMaxSpeedForSlope(100,6,{low:3.3,medium:4.4,high:5.225}),60);
const gradeProfile=d.analyzeTrack([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:20,y:10}],{
 minTurnRadiusMeters:29,maxLateralAcceleration:1,maxSpeedKmh:100,
 slopePercent:[0,4.5,0,0],slopeThresholds:{low:3.3,medium:4.4,high:5.225}
});
assert.equal(gradeProfile.length,2);
assert.ok(gradeProfile[0].speedKmh<gradeProfile[1].speedKmh);
assert.ok(Math.abs(gradeProfile[0].speedKmh/gradeProfile[1].speedKmh-.75)<1e-8);
assert.deepEqual(d.analyzeTrack([{x:0,y:0},{x:10,y:0}],{}),[]);
console.log('Track dynamics tests passed');
