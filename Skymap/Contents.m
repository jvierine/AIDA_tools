% Skymap - a good accuracy star-chart/ephemeris program 
% Version (1.7) (20200918)
% Path ->  AIDA_tools/Skymap
%   
% Skymap
% Skymap - a good accuracy star-chart/ephemeris program 
% with Pulkovo spectrophotometric catalog interface. 
% 
% Main User-Interface:
%  skymap  - An easy to use astronomical starchart.
% 
% User-usable functions:
%  getspec       - high resolution stellar spectras at 350-1150 nm
%  above_horizon - finds stars above the horizon at place and time,
%  refrcorr      - From true zenith to apparent zenith
%  date2juldate  - calculates the julian date at 0h UT
%  utc2losidt    - calculates the local sidereal time.
%  utc2sidt      - calculates the sidereal time.
% 
%  solar_pos - Get the sky position of the sun
%  moonpos   - calculates lunar azimuth, zenith and apparent zenith angles
%
%  staroverplot - plots the stars over an image.
% 
% Functions called from GUI:
%   skyhelp            - Main GUI help function
%   s_preferences      - PREFERENCES - set preferences for starcal and skymap
%   def_s_preferences  - default preferences for starcal
%   starplot           - plots the skymap.
%   findneareststar    - finds the star closes to sky-point
%   findneareststarxy  - finds the star closest to point in image
%   plotspec           - SKMP-private called through skymap/starcal GUI and makes
%   guigetspec         - "Private" script (!) called through skymap/starcal GUI and asks
%   skmp_disp_pos_time - extracts position and time from SkMp
%   skmp_close         - close skymap windows
%
% Star-catalog reading functions
%   loadstars2              - load stars from the: Bright Star Catalogue, 5th Revised
%   read_all_astro_catalogs - generic astronomic catalog reader function
%   read_bsc                - reads Bright Star Catalog, makes STAR_LIST struct-array
%   read_SAO                - loads stars from the SAO Star Catalogue
%   read_sao                - loads stars from the SAO Star Catalogue
% 
% Celestial help-functions
%   fix_ra_decl      - Extract rect ascension and declination from star
%   infov2           - finds stars inside a specified field of view
%   nutation         - calculates the nutation 
%   planet_positions - Calculates the positions of the Sun, Moon and planets
%   plottablestars2  - Selects stars in INFOVSTARS brighter than MAGN
%   makespec         - high resolution stellar spectras around visible wavelengths.
%   sk_make_rgb      - transform Pulkovo spectra into RGB triplet
%   starbas          - calculates untit vectors of a rotated coordinate system.
%   starbestaemft2   - determines the possition of stars relative to axis
%   starpos2         - gives the azimuth, zenith and apparent zenith angles
%
% Assorted help-functions
%   camera_rot     - determines the coordinate system of the camera 
%   checkisok      - "Private" function, not much use for a user to call this function
%   checkok        - displays time and observation site GUI for user choise.
%   num8str        - numerical to string converter
%   poschoice      - short function that updates the GUI windows
%   plotgrid       - plots Azimuth-Zenith or Rect acsention-Declination grid. 
%   skymap         - An easy to use astronomical starchart.
%   staroverplot   - plots the stars over an image.
%   station_reader - collects station number, name, long, lat  
%   updstrinfo     - function that handles the callback from
%   updstrpl       - Is the callback for all changes in the user interface
