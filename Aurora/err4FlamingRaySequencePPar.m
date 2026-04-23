function Err = err4FlamingRaySequencePPar(PolyCoeffs,ImStack,stns,X3D,Y3D,Z3D,A2zA1z,E,Imbg,v_p,I0,pmin,pmax,C_filter6730,C_filter7774,errOps)
% ERR4FLAMINGRAYSEQUENCEP - error function for flaming ray sequence
%   where the parameters to the 1-time-step function
%   err4FlamingRaysE are calculated as low-order polynomials of
%   time (as expressed by its index in time sequence).
%   This makes for very smooth variations in time of parameters. 
%
% Calling:
%   Err = err4FlamingRaySequenceP(PolyCoeffs,ImStack,stns,X3D,Y3D,Z3D,A2zA1z,E,Imbg,v_p,I0,pmin,pmax,C_filter6730,C_filter7774,errOps)
% Input:
%   PolyCoeffs - polynomial coefficients for all parameters in v_p,
%                to calculate the parameters that should go into I0
%                at every time-step.
%   ImStack    - Image stack
%   stns       - stations struct for use with the fastprojection
%                algorithm, see fastprojection/tomo_setup
%   X3D        - East coordinate of 3-D block-of-blobs
%   Y3D        - North coordinate of 3-D block-of-blobs
%   Z3D        - altitude coordinate of 3-D block-of-blobs
%   A2zA1z     - cell array with altitude production profiles for
%                calculation of altitude profiles from electron
%                spectra.
%   E          - electron energy array (to match A2zA1z)
%   Imbg       - cell-array with background image stacks
%   v_p        - what parameters should be variable and calculated
%                and inserted into I0
%   I0         - All parameters for calculating the volume emissions
%                of the rays, that should go into err4FlamingRaysE
%   pmin       - Lower bound of I0(v_p)
%   pmax       - Upper bound of I0(v_p)
%   C_filter6730 - Intensity calibration factor for ASK 6730 filter+camera
%   C_filter7774 - Intensity calibration factor for ASK 7774 filter+camera
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
  ITC(:,iP) = polyval(PolyCoeffs([1:(Np+1)]+(iP-1)*(Np+1)),(iALL-mean(iALL))*2/max(iALL));
end

out_arg_types = errOps.Var_arg_outs;

% parfor i1 = timeSteps2do,
for i1 = timeSteps2do
  Iq = ( wiener2(ImStack{1}(:,:,i1),[3,3]) - wiener2(Imbg{1}(:,:,i1),[3,3]) ) * 1/C_filter6730;
  stns(1).img = Iq;
  Iq = ( wiener2(ImStack{3}(:,:,i1),[3,3]) - wiener2(Imbg{3}(:,:,i1),[3,3]) ) * 1/C_filter7774;
  stns(2).img = Iq;
  res = err4FlamingRaysE(ITC(i1,:),v_p,I0,stns,{errOps.errMask,errOps.errMask},Z3D,X3D(:,:,115),Y3D(:,:,115),A2zA1z,E,out_arg_types(i1),110,errOps);
  % ErrR(i1) = res.err;
  if all(out_arg_types==1)
    ErrR(i1) = res;
    for iP = 1:length(v_p)
      ErrR(i1) = ( ErrR(i1) + ...
                   1e10*abs(ITC(i1,iP)-pmin(iP)).^1.5.*(ITC(i1,iP)<pmin(iP)) + ...
                   1e10*abs(ITC(i1,iP)-pmax(iP)).^1.5.*(ITC(i1,iP)>pmax(iP)) );
    end
  else
    Err = res;
  end
end

%ErrR
if all(out_arg_types==1)
  Err = sum(ErrR);
end
