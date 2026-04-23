function  [xC,yC,zC] = extract_contours(C)
%extract_contours extract x, y, and z coordinates from contours.
%   
% Calling:
%   [xC,yC,zC] = extract_contours(C)
% Input:
%   C - contour-array as returned from contour.
% Output:
%   xC - cell-array with x-coordinates of each contour-element in
%        C, each element in xC is a double array [1 x nCurrC] with
%        different number of elements
%   yC - cell-array with y-coordinates of each contour-element in
%        C, same size as xC
%   zC - cell-array with z-coordinates of each contour-element in
%        C, same size as xC and yC.
% Example:
%   x = 1:123;
%   y = 1:123;
%   z = peaks(123);
%   nC = 10;
%   [C,ch] = contour(x,y,z,nC);
%   [xC,yC,zC] = extract_contours(C);
% 
% The function don't do any argument-checks. 
% 
% See also CONTOUR, CONTOURM.

% Copyright © B. Gustavsson 20230112, <bjorn.gustavsson@uit.no>
%   This is free software, GPL version 3 or later applies


iC = 1;
idxC = 1;
while iC < size(C,2)
  nP         = C(2,iC);        % number of points in current contour
  xC{idxC}   = C(1,iC+(1:nP)); % x coordinates of current contour
  yC{idxC}   = C(2,iC+(1:nP)); % y coordinates of current contour
  zC{idxC}   = C(1,iC)*ones(size(yC{idxC}));  % z-level of contour
  cAll(idxC) = C(1,iC);
  iC         = iC+nP+1;              % Start-point of next contour
  idxC       = idxC + 1;             % next contourline index
end
