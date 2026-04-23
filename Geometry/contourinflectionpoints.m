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
%   fK = [1/4,3/4,1,3/4,1/4]/3;
%   r_s = contourinflectionpoints(C,fK);
%   hold on
%   plot(r_i(:,1),r_i(:,2),'b.')
%   plot(r_s(:,1),r_s(:,2),'r.','markersize',15)
%
% No argument checks or error-controls, if you want that you have
% to pay me good money.

% Copyright © B. Gustavsson 20140530, <bjorn.gustavsson@uit.no>
%   This is free software, GPL version 3 or later applies

%%Extract the individual contour-lines
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
end

r_inflections = [];
for iC = 1:length(xC),

  r_i = curveinflectionpoints(xC{iC},yC{iC});
  r_inflections = [r_inflections;r_i];
  
end
