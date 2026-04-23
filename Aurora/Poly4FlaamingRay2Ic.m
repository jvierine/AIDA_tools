function Ic = Poly4FlaamingRay2Ic(PolyCoeffs,v_p,errOps)
% ERR4FLAMINGRAYSEQUENCEP - error function for flaming ray sequence
%   where the parameters to the 1-time-step function
%   err4FlamingRaysE are calculated as low-order polynomials of
%   time (as expressed by its index in time sequence).
%   This makes for very smooth variations in time of parameters. 
%
% Calling:
%   Ic = err4FlamingRaySequenceP(PolyCoeffs,v_p,errOps)
% Input:
%   PolyCoeffs - polynomial coefficients for all parameters in v_p,
%                to calculate the parameters that should go into I0
%                at every time-step.
%   v_p        - what parameters should be variable and calculated
%                and inserted into I0
%   errOps       - options struct, with fields: .timeSteps2do,
%                  .polydegree, .errMask, .bias2cylindrical,
%                  .bias2x0y0, .x0y0
% Output:
%  Err - total error, sum of squared residuals between modeled ray
%   images and observed background-reduced image and the penalties
%   for being outside the lower-upper bounds, with some
%   biasing-errors as well.

% errOps.bias2cylindrical


timeSteps2do = errOps.timeSteps2do;
Np = errOps.polydegree;
iALL = errOps.AllTimeSteps;% = 1:20; % 1:max(timeSteps2do);

for iP = 1:length(v_p)
  % ITC(:,iP) = polyval(PolyCoeffs([1:(Np+1)]+(iP-1)*(Np+1)),(iALL));
  Ic(:,iP) = polyval(PolyCoeffs([1:(Np+1)]+(iP-1)*(Np+1)),(iALL-mean(iALL))*2/max(iALL));
end
