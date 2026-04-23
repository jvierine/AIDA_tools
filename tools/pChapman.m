function [chpm_int] = pChapman(pars,z)
% pCHAPMAN - gives a polynomially generalized Chapman profile.
% 
% Calling:
%   chpm_int = chapman(I0,hmax,w0,h)
% Input: 
%   I0 - Max intensity
%   H0 - altitude of max intensity
%   W0 - width
%   H  - Altitude array.

%       Bjorn Gustavsson
%	Copyright © 1997 by Bjorn Gustavsson
%   This is free software, licensed under GNU GPL version 2 or later

I0 = pars(1);
z1 = z - pars(2);
w0  = [1 pars(3)];
polycoeffs = [fliplr(pars(4:end)),0];

h_u = (z1)./w0(2);
h_d = (z1)./w0(1);
  
hi = h_d;
hi(z1>0) = h_u(z1>0);

hi = polyval(polycoeffs,hi);
chpm_int = 1*I0*exp(1-hi-exp(-hi));
