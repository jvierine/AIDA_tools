function [planetary_positions,planet_list] = planet_positions(SkMp)
% PLANET_POSITIONS - Calculates the positions of the Sun, Moon and planets
%  planet_positions calculates the AZ and Ze position of the major
%  solar-system bodies, as seen from a position on ground. This function
%  uses the PlanetPos_package for calculation of the Right ascension and
%  declination of the planets and the Moon. This function is called from 
%  CHECKISOK. 
% 
% This function depends on: Positions of solar system bodies:
% https://se.mathworks.com/matlabcentral/fileexchange/77359-positions-of-solar-system-bodies
% 
% See also: checkisok, skymap

%   Copyright © 20200918 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later

date_time = SkMp.tid0;
long_lat  = SkMp.pos0;
SAT_Const

% Initialize UT1-UTC and TAI-UTC time difference
fid = fopen('eop19620101.txt','r');

eopdata = fscanf(fid,'%i %d %d %i %f %f %f %f %f %f %f %f %i',[13 inf]);

fclose(fid);

Mjd_UTC = Mjday(date_time(1),...
                date_time(2),...
                date_time(3),...
                date_time(4),...
                date_time(5),...
                date_time(6));

[UT1_UTC, TAI_UTC] = IERS(eopdata, Mjd_UTC);
[~, ~, ~, TT_UTC] = timediff(UT1_UTC, TAI_UTC);

Mjd_TT = Mjd_UTC + TT_UTC/86400.0;

% Heliocentric coordinates
rMoon = MoonPos(Mjd_TT);
rSun = SunPos(Mjd_TT);
rVenus = VenusPos (Mjd_TT);
rUranus = UranusPos (Mjd_TT);
rSaturn = SaturnPos (Mjd_TT);
rPluto = PlutoPos (Mjd_TT);
rMercury = MercuryPos(Mjd_TT);
rMars = MarsPos (Mjd_TT);
rJupiter = JupiterPos (Mjd_TT);
rNeptune = NeptunePos (Mjd_TT);


% Geocentric Equatorial Coords: Planet_vector + rSun_vector
rSSB(9,:) = rMoon    + rSun;
rSSB(8,:) = rPluto   + rSun;
rSSB(1,:) = rMercury + rSun;
rSSB(2,:) = rVenus   + rSun;
rSSB(3,:) = rMars    + rSun;
rSSB(4,:) = rJupiter + rSun;
rSSB(5,:) = rSaturn  + rSun;
rSSB(6,:) = rUranus  + rSun;
rSSB(7,:) = rNeptune + rSun;

% Right Ascention and Declination of planets
for i_p = size(rSSB,1):-1:1
  ra(i_p) = atan2(rSSB(i_p,2),rSSB(i_p,1));
  if ra(i_p) < 0
    ra(i_p) = ra(i_p) + 2*pi;
  end
  decl(i_p) =  atan2(rSSB(i_p,3),sqrt(rSSB(i_p,1)^2+rSSB(i_p,2)^2));
  % Spherical coordinates at location on Earth
  [azMe,zeMe,apzeMe] = starpos2(ra(i_p)*180/pi*24/360,...
                                decl(i_p)*180/pi,...
                                date_time(1:3),...
                                date_time(4:6),...
                                long_lat(2),long_lat(1));
  planetary_positions(i_p,:) = [azMe,zeMe,-i_p,nan,0,-i_p,apzeMe];
  planet_list(i_p) = make_planetlist(planetary_positions,ra,decl,i_p);
  planetary_positions(i_p,4) = planet_list(i_p).Magn;
end
               
function planet_elem = make_planetlist(planetary_position,ra,decl,idx)
% MAKE_PLANETLIST - create structs for solar-system-bodies to put into
% star_list array 

pNames = {'Mercury','Venus', 'Mars',     'Jupiter',     'Saturn','Uranus','Neptune','Pluto',     'Moon','Sun'};
pCLRS  = {   [1 0 1],[1 1 0],[1 0 0],[0.6 0.4 0.2],[0.3 0.3 0.3], [0 1 1],  [0 0 1],[0 0 0],[1 0.9 0.9],[1 1 1]};
Magns =  [   -0.05     -3.5,   -2.2,          -2.3,          0.4,     5.7,      7.8,     14,       -7.2,  -26.8];

planet_elem.Name = pNames{idx};
planet_elem.Azimuth = planetary_position(idx,1)*180/pi;
planet_elem.Zenith = planetary_position(idx,2)*180/pi;
planet_elem.App_Zenith = planetary_position(idx,end)*180/pi;
planet_elem.Ra   = rad2hhmmssstr(ra(idx)*12/pi);
planet_elem.Decl = rad2hhmmssstr(decl(idx)*180/pi);
planet_elem.H_D_number = -idx;
planet_elem.Bright_Star_Nr = -idx;
planet_elem.spectra = 1;
planet_elem.rgb =  pCLRS{idx};
planet_elem.Magn = Magns(idx);
if idx == 10
  planet_elem.Type = 'Sun';
elseif idx == 9
  planet_elem.Type = 'Moon';
else
  planet_elem.Type = 'Planet';
end

function HHMMSSstr = rad2hhmmssstr(x)
HHMMSSstr = sprintf('%02d:%02d:%03.1f',...
                    floor(x),...
                    floor(60*(x-floor(x))),...
                    60*( (60*(x-floor(x)))- floor(60*(x-floor(x)))));

