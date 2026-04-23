function [I2D] = clipped_moving_Gaussian2poly(pars,x,y,t,clipint,PSMu,PSMv)
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


I0    = pars(1);
t0    = pars(2);
dt    = pars(3);
dr    = pars(4);
ddxdy = pars(5);
phi   = pars(6);
gamma = pars(7);
alpha = pars(8);

dx = dr;
dy = dr*ddxdy;
I2D = 0*x;
for i_t = 1:numel(t)
  xC = polyval(PSMu{1},t0+i_t*dt,PSMu{2},PSMu{3});
  yC = polyval(PSMv{1},t0+i_t*dt,PSMv{2},PSMv{3});
  I_peak = I0*exp(alpha*(t(i_t)-t(1)));
  
  I2D = I2D + I_peak*exp(-abs((+cos(phi)*(x-xC)+sin(phi)*(y-yC)).^2/dx^2 + ...
                              (-sin(phi)*(x-xC)+cos(phi)*(y-yC)).^2/dy^2 ...
                              ).^(gamma/2) ...
                         );
end

I2D = min(I2D,clipint);
