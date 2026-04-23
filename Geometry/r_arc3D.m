function r_arc = r_arc3D(e1,e2,r0,radius,n_points)
% R_ARC3D - return a 3-D circular arc between 2 arrays
% r_arc3D calculates the 3-D coordinates of a circular arc between
% 2 vectors.
% 
% Calling:
%   r_arc = r_arc3D(e1,e2,[r0[,radius[,n_points]]])
% Input:
%  e1 - vector 1, double array [3 x 1] or [1 x 3]
%  e2 - vector 2, double array [3 x 1] or [1 x 3]
%  r0 - centre-point of arc, double array [3 x 1] or [1 x 3],
%       optional argument defaults to [0 0 0].
%  radius - radius of arc, double scalar, optional argument
%           defaults to one.
%  n_points - number of points along arc, scalar int, optional
%             argument defaults to 100.
% Output:
%  r_arc - 3-D points along arc, double array [n_points x 3]
% Example:
%  
if nargin < 5 || isempty(n_points)
  n_points = 100;
end
if nargin < 4 || isempty(radius)
  radius = 1;
end
if nargin < 3 || isempty(r0)
  r0 = [0 0 0];
end

e_perp = cross(e1/norm(e1),e2/norm(e2));
theta = linspace(0,angle_arrays(e1,e2),n_points);

for i1 = numel(theta):-1:1
  r_arc(i1,:) = radius*rot_around_v(e_perp,theta(i1))*e1(:)+r0(:);
end
