function [I2D] = clipped_moving_Gaussian(pars,x,y,t,clipint,t0)
% STARINT3 evaluation of a 2D gaussian.
% 
% STARINT3 calculates a 2D gaussian on a matrix located
% between (xmin,xmax) and (ymin,ymax) the maxintensity
% and the spread of the gaussian is given in the array
% PARS.
% 
% Calling:
%  [I2D] = clipped_moving_Gaussian(pars,x,y,t)


%   Copyright © 19970907 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

if nargin < 6
  t0 = t(1);
end
I0    = pars(1);
x0    = pars(2);
y0    = pars(3);
dr    = pars(4);
ddxdy = pars(5);
phi   = pars(6);
gamma = pars(7);
vx    = pars(8);
vy    = pars(9);
alpha = pars(10);

dx = dr;
dy = dr*ddxdy;
I2D = 0*x;
for i_t = 1:numel(t)
  
  xC = x0 + vx*(t(i_t) - t0);
  yC = y0 + vy*(t(i_t) - t0);
  I_peak = I0*exp(alpha*(t(i_t)-t0));
  
  I2D = I2D + I_peak*exp(-abs((+cos(phi)*(x-xC)+sin(phi)*(y-yC)).^2/dx^2 + ...
                              (-sin(phi)*(x-xC)+cos(phi)*(y-yC)).^2/dy^2 ...
                              ).^(gamma/2) ...
                         );
end

I2D = min(I2D,clipint);
