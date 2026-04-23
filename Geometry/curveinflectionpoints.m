function r_inflections = curveinflectionpoints(xC,yC,fK)
% CURVEINFLECTIONPOINTS - find inflection-points on curves 
%  CURVEINFLECTIONPOINTS identifies inflection points on
%  plane curves by identifying line-segments where the curvature
%  changes direction. The curve is interpreted as a number
%  of connected straight-line-segments and an inflection-point is
%  identified as the mid-point of a line-segment where the
%  neihbouring points fall on opposite sides of the extension of
%  the line-segment.
% 
% Calling:
%   r_inflections = curveinflectionpoints(xC,yC,fK)
% Input:
%   xC - x-coordinates of curve, double array, [nP x 1] or [1 x nP]
%   yC - y-coordinates of curve, double array, [nP x 1] or [1 x nP]
%   fK - filter-factors used to smoothen the contour-lines (simple
%        experimentation reveal that contourlines can have a large
%        number of spurious inflection-points, smoothing of the
%        contour-lines reduces this problem, user tuning required).
% Output:
%   r_inflections - [n x 2] double array with identified
%                   inflection-points. 
% 
% Example:
%   x = linspace(-3,3,301);
%   y = atan(x);
%   figure
%   subplot(1,2,1)
%   plot(x,y,'r')
%   hold on
%   plot(y,x,'b')
%   r_1 = curveinflectionpoints(x,y);
%   r_2 = curveinflectionpoints(x,y);
%   plot(r_1(:,1),r_1(:,2),'r+','linewidth',2)
%   plot(r_2(:,1),r_2(:,2),'bx','linewidth',2)
%   x = [ 0 1 2 3 4 5 6 7];
%   y = [-1 0 0 0 0 0 1 1];
%   r_i = curveinflectionpoints(x,y);
%   subplot(1,2,2)
%   plot(x,y,'.-')
%   hold on
%   plot(r_i(:,1),r_i(:,2),'ro','linewidth',2)

% No argument checks or error-controls, if you want that you have
% to pay me good money.

% Copyright © B. Gustavsson 20140530, <bjorn.gustavsson@uit.no>
%   This is free software, GPL version 3 or later applies


r_inflections = [];
if nargin > 2 && ~isempty(fK)
  xC = filtfilt(fK/sum(fK),1,xC);
  yC = filtfilt(fK/sum(fK),1,yC);
end

iInflections = 1;
iP = 2;
while iP <= (length(xC)-2)
  i2next = 2;
  % We need 3 non-colinear line-segments
  % First take 3 points on the current contour :
  r_m = [xC(iP-1);yC(iP-1)]; % point before the central line-segment
  r0 = [xC(iP);yC(iP)];      % point 1 on central line-segment
  r1 = [xC(iP+1);yC(iP+1)];  % point 2 on central line-segment
  if norm(cross([r0-r_m;0]/norm([r0-r_m;0]),[r1-r0;0]/norm([r1-r0;0]))) > 10*eps % check of co-linearity
    % let them define a stratight line on the form: 
    % dot(r,e_n) - 1 = 0
    e_n = [cos(pi/2) sin(pi/2);-sin(pi/2) cos(pi/2)]*(r1-r0)/norm(r1-r0);
    l = dot(r0,e_n);
    % the points on the contour on either side of the line-segment:
    r_p = [xC(iP+i2next);yC(iP+i2next)];
    while  norm(cross([r1-r0;0]/norm([r1-r0;0]),[r_p-r1;0]/norm([r_p-r1;0]))) < 10*eps
      i2next = i2next + 1;
      if iP+i2next>numel(xC)
        return
      end
      r1 = r_p;
      r_p = [xC(iP+i2next);yC(iP+i2next)];
    end
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
  iP = iP + i2next-1;
end
