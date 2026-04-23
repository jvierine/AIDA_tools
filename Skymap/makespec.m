function makespec(bright_star_nr,verbosity)
% makespec - high resolution stellar spectras around visible wavelengths.
% 
%   MAKESPEC is a matlab wrapper to getsp a C-shell script that
%   reads the Pulkovo Spectrophotometric Catalog. WAVELENGTHS are
%   given in nm, and ENERGYFLUXES in W/m^2/m
% 
% Calling:
%   [wavelengths,energyfluxes] = makespec(bright_star_nr,verbosity)
% Input:
%   BRIGHT_STAR_NR - bright star catalog index of star whose
%                    spectra we want.
% Output:
%   WAVELENGTHS - wavelengts (nm), not necessarily monotonic
%   ENERGYFLUXES - energy flux of the star in wavelength
%                  region. (W/m^2/m)
% 
% Works, provided the C-shell script getsp can be executed
% (typically one has to make sure one has execute permision on the
% file, otherwise all stars will erroneously lack speckra), and
% provided one can create a file '/tmp/test1.qWe' - which means
% that MS-DOS/WINDOWS are on thin ice (If anyone know how to fix
% this I'd be happy to know, BG:bjorn@irf.se)



%   Copyright © 20200918 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later
%
%   Copyright © 2002 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later


if nargin == 1
  verbosity = 1;
end
[stardir] = fileparts(which('skymap'));

qWe_cmd = ['cd ',fullfile(stardir,'/stars/'),' ;./getsp ',num2str(bright_star_nr),' > ',fullfile(stardir,'../tmp',[num2str(bright_star_nr),'.dat'])];
%TBR?: [qWe_q,qWe_w] = unix(qWe_cmd);
% [qWe_q,qWe_w] = unix(qWe_cmd);
[qWe_q,~] = system(qWe_cmd);
if qWe_q == 0
  % everything A-OK
elseif verbosity == 1
  disp(['No specra in `Pulkovo Spectrophotometric Catalog'' for star: ',num2str(bright_star_nr)])
end
