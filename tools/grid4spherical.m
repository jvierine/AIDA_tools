function [xG,yG,zG] = grid4spherical(e_centre,theta,nPhi)
% GRID4SPHERICAL - 
%   

if nargin < 3 || isempty(nPhi)
  nPhi = 24;
end

e_rand = randn(size(e_centre));
e_rand = e_rand/norm(e_rand);

while dot(e_centre,e_rand) > 0.9
  e_rand = randn(size(e_centre));
  e_rand = e_rand/norm(e_rand);
end
e_rand = cross(e_centre,e_rand);
e_rand = e_rand/norm(e_rand);

for i1 = numel(theta):-1:1
  R = rot_around_v(e_rand,theta(i1));
  RC = rot_around_v(e_centre,2*pi/nPhi);
  e_tmp = R*e_centre(:);
  for i2 = nPhi:-1:1
    e_tmp = RC*e_tmp(:);
    xG(i1,i2) = e_tmp(1);
    yG(i1,i2) = e_tmp(2);
    zG(i1,i2) = e_tmp(3);
  end
  xG(i1,nPhi+1) = e_tmp(1);
  yG(i1,nPhi+1) = e_tmp(2);
  zG(i1,nPhi+1) = e_tmp(3);
end
xG(end+1,:) = xG(1,:); 
yG(end+1,:) = yG(1,:); 
zG(end+1,:) = zG(1,:); 

