function [alpha,beta] = camera_point2azze(varargin)
% CAMERA_POINT2AZZE - 
%   
% Calling:
%  [alpha,beta] = camera_point2azze(e_target)
%  [alpha,beta] = camera_point2azze(az,ze)
%  [alpha,beta] = camera_point2azze(az,ze,dodegs)

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


