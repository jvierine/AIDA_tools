function res = err4FlamingRayAW_I_lambda_tz_given(Par,stns,tObs,Imgstacks,ImRois,Z3D,x2D,y2D,t4I,I_lambda_of_tz,out_arg_type)

%   Copyright © 20251112 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

% constraining_error = 0;

% if nargin == 0
%  res = derrOps;
%  return
% end

% if nargin > 12 && ~isempty(errOps)
%   derrOps = merge_structs(derrOps,errOps);
% end

for i_L = length(stns):-1:1
  Vem{i_L} = zeros(size(Z3D));
end

C_Ie = Par(1); % Scaling-factor for Ie of this ray, scales all Vem
x0   = Par(2); % Horizontal center of this ray
y0   = Par(3); % Horizontal center of this ray
dt   = Par(4); % time-shift from first columns in the VER-arrays
dlp0 = Par(5); % Constant term for width perp B
dlp1 = Par(6); % coefficient for linear term for width perp B
dlp2 = Par(7); % coefficient for quadratic term for width perp B

% The parameters are for scaling the overall brightness of the emissions,
% by effectively scale the electron-fluxes above the ionosphere, C_Ie;
% setting the foot-point of the ray, [x0, y0], and to optimally align the
% time-variation of the modeled ray we allow a time-adjustment, dt, 
% the horizontal width of
% the precipitation (that we know changes with time) as a low-order
% polynomial

err = 0;
for it = 1:size(Imgstacks{1},3)
  
  % This should be the width of the Gaussian of the primary precipitation
  ds_perp = dlp0 + dlp1*( it - 1 ) + dlp2*( it - 1 )^2;

  % That we then make the horizontal intensity variation of the
  % precipitation:
  I_hor =  C_Ie * exp( -( (x2D - x0).^2 + (y2D - y0).^2 )/ds_perp^2 );
  % E_at_t = interp1(E_of_t,max(1,min(numel(E_of_t),it+dt)));
  % Since the electrons spread horizontally due to collisional random
  % walk we should convolve the "straight VER profile" with the
  % energy-dependent horizontally widening (Stalder's "Christmas-tree")
  % s_perp_of_z_at_t = interp1(log(E_4_s),...
  %                            s_perp_of_E,log(max(min(E_4_s),...
  %                                               min(max(E_4_s),...
  %                                                   E_at_t))));
  % all of this max-min(min-max-hulabaloo is to keep the interpolation-
  % point inside the range of E_4_s

  % Then we make altitude profiles for all the emissions:
  for i_L = length(stns):-1:1
    
    % The altitude profile of the volume emission-rates at time it+dt
    I_Z_at_t{i_L} = mean(interp1(t4I,...
                                 I_lambda_of_tz,...
                                 linspace(tObs(it),tObs(it+1),10)+dt,...
                                 'pchip',0),...
                         2); % TODO: figure out scaling to #/m3/s 
    % The altitude-horizontal variation of the volume emission
    % rates should just be the "outer product" of the two:
    for i_z = length(I_Z_at_t{i_L}):-1:1
      % Since the electrons spread horizontally due to collisional random
      % walk we should convolve the "straight VER profile" with the
      % energy-dependent horizontally widening (Stalder's "Christmas-tree")
      % This should make up a horizontal slice of the volume
      % emission rate of emission at
      Ivh = I_Z_at_t{i_L}(i_z)*I_hor;
      Vem{i_L}(:,:,i_z) = Vem{i_L}(:,:,i_z) + Ivh;%{i2};
    end
    % keyboard
    currImg{i_L}  = Imgstacks{i_L}(:,:,it);
    imsz = size(currImg{i_L});
    currProj{it} = fastprojection(Vem{i_L},...
                                  stns(i_L).uv,...
                                  stns(i_L).d,...
                                  stns(i_L).l_cl,...
                                  stns(i_L).bfk,...
                                  imsz,1,stns(i_L).sz3d);
    % sum of square of Image difference - over the selected region of interest:
    err1 = sum( ( currImg{i_L} - currProj{i_L}(:) ).^2.*(ImRois{i_L}(:)==1) );
    err = err + err1;
    
  end
  
end


%%% This snippet is just an old example of how to bias parameters
%to be close to some prefered/physically sensible range of
%values. Potentially adapt to needs as necessary...
% $$$ if ~isempty(biasAmplitudes)
% $$$   err = err + sum(biasAmplitudes(:).*( Par(:) - biasVals(:) ).^2);
% $$$   err = err + 500*sum( ( 2 - I0(:,6) ).^5 .* ( I0(:,6) < 2) );
% $$$ end

% if err < 0 || ~isfinite(err)
%   keyboard
% end
switch out_arg_type
 case 1 % Error
  res = err;
 case 2 % Vem and projections
  res.par = I0;
  res.err = err;
  res.IeOutput = IeOutput;
  res.Vem{1} = Vem{1};
  res.Vem{2} = Vem{2};
  res.currImg = currImg;
  res.currProj = currProj;
 otherwise
end
%                                                   1    2         3      4   5   6   7              8           9           10     11
% errDeParallax - error function for estimating electron spectra
% from auroral arcs seen of magnetic zenith
%
% Calling:
%   res = err4FlamingRayAW_I_lambda_tz_given(Par,stns,Imgstacks,ImRois,Z3D,x2D,y2D,I_lambda_of_tz,out_arg_type,z_max,errOps)
% Input:
%  Par            - varying parameters
%  stns           - struct describing geomertic part of image
%                   projection tailored for fastprojection, see
%                   camera_set_up_sc and fastprojection, and
%                   TOMO20080305NewBeginnings for more details.
%  ImRois         - cell array (same size as stns) with binary
%                   "region of interest" matrices, with 1 for the
%                   regions surrounding the auroral rays in the
%                   corresponding images of stns
%  Z3D            - 3-D matrix with altitudes of blob centres, as
%                   used for setting up the stns structs [ny,nx,nz].
%  x2D            - west-east horizontal coordinates for gound
%                   plane of 3-D block-of-blobs.
%  y2D            - south-north horizontal coordinates for gound
%                   plane of 3-D block-of-blobs.
%  Ie2H           - Cell array {nLambda x 1} with projection matrices
%                   from electron spectra to altitude variation of
%                   volume emission rate each cell element: [nZ x nE]
%                   preferably calculated on a far denser grid than
%                   Z3D and then averaged to the altitude
%                   resolution of Z3D with cos^2 weights.
%  E              - Array of energies for Ie2H{i1}(i2,:). Assumed
%                   to be keV.
%
%
% More details:
%  * The function can calculate the volume emission rate distribution
%  from multiple rays of precipitation - in case it is difficult to
%  isolate one ray well. This is done by giving PAR0 for more than
%  one ray (n x 10 parameters/ray)
%  * The function does not include any
%  contribution from diffuse background aurora so that should be
%  done to the images beforehand.
%  * In this function it is way preferable to have a skewed
%  horizontal 3-D grid.
%  * The horisontal intensity variation of a ray is calculated
%  relative to its footprint centres.
%  * another tedious procedure will be to make the
%  region-of-interest matrices. That on the other hand I think will
%  be relatively simple with inpolygon after ginput-ing points of
%  the polygon bounding/surrounding the ray.
%  * The function should be minimised with fminsearch/fminsearchbnd
%  * To speed things up the optimal parameters for one time-step
%  can/should be used as start parameters for the next time-step.
%  * The main problem will be to make good start guesses for the
%  parameters. More on this later.
%  

%%
%    % The altitude profile of the volume emission-rates at time it+dt
%    I_Z_at_t{i_L} = interp1(1:size(I_lambda_of_tz{i_L},2),...
%                            I_lambda_of_tz,...
%                            max(1,min(size(I_lambda_of_tz{i_L},2),it+dt)));
