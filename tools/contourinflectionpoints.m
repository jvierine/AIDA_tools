function r_inflections = contourinflectionpoints(C,fK)
% CONTOURINFLECTIONPOINTS - find inflection-points on contourlines 
%  CONTOURINFLECTIONPOINTS identifies inflection points on
%  contourlines by identifying line-segments where the curvature
%  changes direction. Each contourline is interpreted as a number
%  of connected straight-line-segments and an inflection-point is
%  identified as the mid-point of a line-segment where the
%  neihbouring points fall on opposite sides of the extension of
%  the line-segment.
% 
% Calling:
%   r_inflections = contourinflectionpoints(C,fK)
% Input:
%   C  - contourline matrix as returned by contourc or the
%        contour-family of functions on the format:
%        C = [level1 x1 x2 x3 ... level2 x2 x2 x3 ...;
%             pairs1 y1 y2 y3 ... pairs2 y2 y2 y3 ...]
%   fK - filter-factors used to smoothen the contour-lines (simple
%        experimentation reveal that contourlines can have a large
%        number of spurious inflection-points, smoothing of the
%        contour-lines reduces this problem, user tuning required).
% Output:
%   r_inflections - [n x 2] double array with identified
%                   inflection-points. 
% 
% Example:
%   M = peaks(127);
%   C = contour(M,8);
%   r_i = contourinflectionpoints(C);
%   fK = [1/2,1,1/2]/2;
%   r_s = contourinflectionpoints(C,fK);
%   hold on
%   plot(r_i(:,1),r_i(:,2),'b.')
%   plot(r_s(:,1),r_s(:,2),'ro','linewidth',3)
% 
% No argument checks or error-controls, if you want that you have
% to pay me good money.

% Copyright © B. Gustavsson 20140530, GPL version 3 or later applies

%% Extract the individual contour-lines
iC = 1;
idxC = 1;
while iC < size(C,2)
nP = C(2,iC); % number of points in current contour
xC{idxC} = C(1,iC+(1:nP)); % x coordinates of current contour
yC{idxC} = C(2,iC+(1:nP)); % y coordinates of current contour
if nargin > 1 && ~isempty(fK)
  xC{idxC} = filtfilt(fK/sum(fK),1,xC{idxC});
  yC{idxC} = filtfilt(fK/sum(fK),1,yC{idxC});
end
iC = iC+nP+1;    % Start-point of next contour
idxC = idxC + 1; % next contourline index
% plot(xC{idxC-1},yC{idxC-1},'b.-')
% pause
end

iInflections = 1;
for iC = 1:length(xC)

for iP = 2:(length(xC{iC})-2)
  % First take 2 points on the current contour :
  r0 = [xC{iC}(iP);yC{iC}(iP)];
  r1 = [xC{iC}(iP+1);yC{iC}(iP+1)];
  % let them define a stratight line on the form: 
  % dot(r,e_n) - 1 = 0
  e_n = [cos(pi/2) sin(pi/2);-sin(pi/2) cos(pi/2)]*(r1-r0)/norm(r1-r0);
  l = dot(r0,e_n);
  % the points on the contour on either side of the line-segment:
  r_p = [xC{iC}(iP+2);yC{iC}(iP+2)];
  r_m = [xC{iC}(iP-1);yC{iC}(iP-1)];
  % lengths along e_n to points r_p and r_m
  l_p = dot(r_p,e_n);
  l_m = dot(r_m,e_n);
  % if they are on either side of the line-segment then we have
  % an inflection point
  if (l_p - l)*(l_m - l) <0
    % take the mid-point of that line-segment as the
    % inflection-point, change this according to taste...
    r_inflections(iInflections,:) = (r0+r1)'/2;
    iInflections = iInflections + 1;
  end
end
end
