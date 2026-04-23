function A = area_projected_ellipsoid(abc,e_normal)
% AREA_PROJECTED_ELLIPSOID - area of 3-D ellipsoid projected onto plane  
%  area_projected_ellipsoid calculates the area of the
%  cross-section of an ellipsoid and a plane, the plane is defined
%  with its normal-unit-vector in the coordinate system oriented
%  along the ellipsoid axes.
% 
% Calling:
%  A = area_projected_ellipsoid(abc,e_normal)
% Input:
%  abc      - The principal semi-axes of the ellipsoid, double
%             array [1 x 3] or [3 x 1], length-unit
%  e_normal - normal-vector of the projection-plane, [1 x3] or 
%             [3 x 1] double array, should have length one.
% Output:
%  A - area parallel-projected onto the plane perpendicular to
%      e_normal, double scalar, (length-unit)^2
% 
% Example:
%  ABC = [1 2 3];
%  e1  = [1 0 0];
%  e2  = [0 1 0];
%  e3  = [0 0 1];
%  e_n = randn(1,3);
%  e_n = e_n/norm(e_n);
%  A1 = area_projected_ellipsoid(ABC,e1);
%  A2 = area_projected_ellipsoid(ABC,e2);
%  A3 = area_projected_ellipsoid(ABC,e3);
%  Ar = area_projected_ellipsoid(ABC,e_n);
%  disp([A1 A2 A3 Ar]/pi)
%
% Reference: GT Vickers, "The projected areas of ellipsoids and
%            cylinders", Powder Technology, 86, 1996, 195-200
%
% See also sphere

%   Copyright © 20200924 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later

A = pi*( e_normal(1)^2*prod(abc(2:3))^2 + ...
         e_normal(2)^2*prod(abc([1 3]))^2 + ...
         e_normal(3)^2*prod(abc(1:2))^2 )^.5;
