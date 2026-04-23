function [alpha,beta] = camera_point2dir(varargin)
% CAMERA_POINT2AZZE - alpha-beta rotation-angles to point in direction
% CAMERA_POINT2AZZE calculates the alpha and beta rotation-angles to get
% the optical axis of a camera to point in the desired direction. The
% direction can either be specified with azimuth, AZ, and zenith, ZE,
% angles or with the vector to point along. The vector does not need to be
% a unit-vector.
% 
% Calling:
%  [alpha,beta] = camera_point2azze(v_target)
%  [alpha,beta] = camera_point2azze(az, ze[, dodegs])
% Input:
%  v_target - vector || to pointing-direction, double array [3 x 1]
%  az       - azimuth angle, double scalar, default in radians, but if used
%             with a third input argument, dodegs, that is true then
%             degrees. Clock-wise angle from North.
%  ze       - zenith angle, double scalar, same as az above
%  dodegs   - optional argument, scalar, set to one or true to use degrees
%             for the az-ze angles.
% Output:
%  alpha - rotation-angle around the y-axis (North), double scalar (deg)
%  beta  - rotation-angle around the x'-axis, that is the x-axis after the
%          first rotation around the y-axis (initially x - East), double
%          scalar (deg)

% Yeah, this should be done with trigonometry, but I'm way too
% lazy. /BG-20251014
if nargin > 1
  az = varargin{1};
  ze = varargin{2};
  if nargin > 2
    dodegs = varargin{3};
  else
    dodegs = 0;
  end
  if dodegs
    e_optax = [sind(az)*sind(ze),cosd(az)*sind(ze),cosd(ze)];
  else
    e_optax = [sin(az)*sin(ze),cos(az)*sin(ze),cos(ze)];
  end
else
  e_optax = varargin{1};
end
alphabeta0 = [0 0];

ops4fms = optimset('fminsearch');
ops4fms.TolX = ops4fms.TolX/1e9; 
ops4fms.TolFun = ops4fms.TolFun/1e9;

alphabeta1 = fminsearch(@(alphabeta) error_fcn(alphabeta,e_optax),...
                        alphabeta0,...
                        ops4fms);

alpha = alphabeta1(1);
beta  = alphabeta1(2);

function err = error_fcn(alphabeta,e_target)
% ERROR_FCN - 
%   

alpha = alphabeta(1);
beta  = alphabeta(2);
[~,~,e3] = camera_base(alpha,beta,0);

err = -dot(e3(:),e_target);


