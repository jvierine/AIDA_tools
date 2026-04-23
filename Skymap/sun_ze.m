function [zenithAngle] = sun_ze(dayOfYear,timeHour,latitude,longitude)
% Copyright 2016 The MathWorks, Inc.

% Make sure time vector is oriented properly
if size(timeHour,1) == 1 && size(timeHour,2) > 1
    timeHour = timeHour';
end

% Make sure day vector is oriented properly
if size(dayOfYear,2) == 1 && size(dayOfYear,1) > 1
    dayOfYear = dayOfYear';
end

% Account for Multiple Days
numTime = numel(timeHour);
numDays = numel(dayOfYear);
timeHour = repmat(timeHour,1,numDays);

% Shift solar noon for longitude
if nargin < 4 || isempty(longitude)
  longitudeShift = 0;
else
  longitudeShift = longitude;
end
% Equation of Time - East/West timeshift associated with elliptical orbit
equationTime = 9.87*sind(2*360/365*(dayOfYear-81)) - ...
    7.53*cosd(360/365*(dayOfYear-81)) - ...
    1.5*sind(360/365*(dayOfYear-81));
solarTimeCorrection = equationTime/60 + longitudeShift/15;
solarTime = timeHour + repmat(solarTimeCorrection,numTime,1);

% Angle of Sun - Related to Solar time (0 deg - vertical sun)
hourAngle = 180*(12-solarTime)/12;

% Sun Declination - varies from +/- 23.45 during year
sunDeclinationAngle = 23.45*sind(360/365*(dayOfYear-81));

% Solar Zenith Angle Calculations
cosineZenith = bsxfun(@plus,sind(latitude)*sind(sunDeclinationAngle),...
    cosd(latitude)*bsxfun(@times,cosd(sunDeclinationAngle),cosd(hourAngle)));
zenithAngle = acos(cosineZenith);
