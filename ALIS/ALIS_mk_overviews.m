function ok = ALIS_mk_overviews(ALIS_root_dir,years2do)
% ALIS_MK_DB_KEOS - Update ALIS Keogram-database
%   
% Calling:
% ok = alis_mk_overviews(alis_root_dir);
% Currently working under the assumption that the images are in
% alis_root_dir (defaults to /alis/stdnames) in a directory tree
% with the following structure:
% /alis/stdnames/YEAR/MONTH/DAY/
% From below the DAY directory files for all images taken that day
% is searched for with unix FIND.
% 


%   Copyright © 2012 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

ALIS_OVERVIEW_ok = cell(2016-1990,12,31); % Storage for processing record...


if nargin < 1 || isempty(ALIS_root_dir)
  ALIS_root_dir = '/alis/stdnames';
  disp(['ALIS_root_dir: ',ALIS_root_dir])
else
  disp(ALIS_root_dir)
end

cd(ALIS_root_dir)

Overview_dir = fullfile(ALIS_root_dir,'..','Overviews');
disp(['Overview_dir: ',Overview_dir])

try 
  load(fullfile(Overview_dir,'overview_log.mat'))
catch
  disp('This is the first time for you, isn''t it?')
end


data_years = dir('2*');
data_years = data_years([data_years(:).isdir]);
data_years = data_years(2);
%data_years = data_years(3:end); % first 2 will always(?) be ./ & ../


OPS = ALIS_auto_overview(-1);
OPS.interference_level = 3;

for iYear = 1:length(data_years)
  
  % Go to the year directory
  cd(data_years(iYear).name)
  % get the months that are archived there
  data_month = dir;
  data_month = data_month([data_month(:).isdir]);
  data_month = data_month(3:end);
  
  for iMonth = 1:length(data_month)
    
    % Go to the month directory
    cd(data_month(iMonth).name)
    % get the days that are archived there
    data_days = dir;
    data_days = data_days([data_days(:).isdir]);
    data_days = data_days(3:end);
    
    for iDay = 1:length(data_days)
      
      % Go to the day directory
      
      if strcmp(ALIS_OVERVIEW_ok{str2num(data_years(iYear).name)-1990,...
                            str2num(data_month(iMonth).name),...
                            str2num(data_days(iDay).name)},...
                'that went just fine')
        % Then that directory was apparently processed.
        disp(['Everything seems ready for: ',data_years(iYear).name,'-',data_month(iMonth).name,'-',data_days(iDay).name])
      else % otherwise get cracking!
        cd(data_days(iDay).name)
        try
          OPS.BaseSaveDir =  fullfile(Overview_dir,data_years(iYear).name,data_month(iMonth).name,data_days(iDay).name);
          mkdir(OPS.BaseSaveDir)
          ALIS_auto_overview(OPS);
          [OK1n2,msg1n2] = ALIS_movie_reencoder(OPS.BaseSaveDir,[],1.414213562);
          ALIS_movie_log{str2num(data_years(iYear).name)-1990,...
                         str2num(data_month(iMonth).name),...
                         str2num(data_days(iDay).name)} = OK1n2;
          ALIS_OVERVIEW_ok{str2num(data_years(iYear).name)-1990,...
                           str2num(data_month(iMonth).name),...
                           str2num(data_days(iDay).name)} = 'that went just fine';
          save(fullfile(Overview_dir,'overview_log.mat'),'ALIS_OVERVIEW_ok','ALIS_movie_log')
        catch
          disp(['PROBLEMS ENCOUNTERED for day: ',data_years(iYear).name,'-',data_month(iMonth).name,'-',data_days(iDay).name])
        end
        % and back up to the month directory
        cd('../') % from day back up to month
      end
    end
    cd('../') % from month back up to year
  end
  cd('../')  % from year back up to root
end
ok = 1;
